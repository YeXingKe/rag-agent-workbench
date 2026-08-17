# 启用延迟注解评估，允许在类型提示中使用尚未定义的类型
from __future__ import annotations

# 导入日志模块，用于记录应用运行日志
import logging
# 导入时间模块，用于计算执行耗时
import time
# 导入上下文管理器装饰器，用于创建资源管理上下文
from contextlib import contextmanager
# 导入数据类装饰器和字段定义，用于创建数据传输对象
from dataclasses import dataclass, field
# 导入日期时间和时区类，用于处理时间戳
from datetime import datetime, timezone
# 导入生成器类型提示，用于流式处理
from typing import Generator

# 从 LangChain 核心消息模块导入 AI 消息和工具消息类型
from langchain_core.messages import AIMessage, ToolMessage
# 导入 SQLAlchemy 数据库操作函数：删除、降序排序、聚合函数、查询构建器
from sqlalchemy import delete, desc, func, select

# 导入清空线程记忆的函数，用于清空会话上下文
from app.agent.memory import clear_thread_memory
# 导入获取 RAG 代理的工厂函数
from app.agent.graph import get_rag_agent
# 导入检索追踪类和绑定函数，用于追踪知识库检索过程
from app.agent.runtime import RetrievalTrace, bind_retrieval_trace
# 导入数据库会话工厂函数
from app.core.postgres import get_session_factory
# 导入查询日志数据模型
from app.models.query_log import QueryLog
# 导入知识库检索函数
from app.rag.retriever import retrieve_chunks
# 导入聊天相关的 Pydantic 数据模式定义
from app.schemas.chat import (
    ChatHistoryItem,  # 聊天历史项
    ChatResponse,  # 聊天响应
    SessionClearResponse,  # 会话清空响应
    SessionSummaryItem,  # 会话摘要项
    SourceChunkItem,  # 来源片段项
)
# 导入 SSE（服务器发送事件）格式化工具函数
from app.utils.sse import format_sse_event

# 创建当前模块的日志记录器实例
logger = logging.getLogger(__name__)


# 使用数据类装饰器，启用 slots 优化内存使用
@dataclass(slots=True)
class ChatRunResult:
    """一次对话调用的标准化结果。"""

    # 会话标识符，用于区分不同用户的对话
    session_id: str
    # AI 生成的回答文本内容
    answer: str
    # 本次对话的响应延迟，单位为毫秒
    latency_ms: int
    # 检索到的知识库来源片段列表
    source_chunks: list[dict]
    # 路由类型，标识使用的处理路径，默认为 agent_rag
    route: str = 'agent_rag'
    # 创建时间戳，默认使用 UTC 时区的当前时间
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class ChatService:
    """对话服务。

    这里把 Agent 调用、SSE 适配、日志记录统一放在 service 层，
    避免 API 层直接处理 LangChain / LangGraph 的细节。
    """

    # 初始化方法，设置服务实例的基本依赖
    def __init__(self) -> None:
        # 获取 RAG 代理实例，用于处理对话逻辑
        self.agent = get_rag_agent()
        # 获取数据库会话工厂，用于数据库操作
        self.session_factory = get_session_factory()

    # 构建 Agent 输入数据的私有方法，参数包括用户消息和可选的预检索片段
    def _build_agent_input(self, message: str, prefetched_chunks: list[dict] | None = None) -> dict:
        """把用户文本包装成 Agent 标准输入格式。"""

        # 初始化消息列表，用于存储系统和用户消息
        messages: list[dict[str, str]] = []
        # 如果存在预检索的知识库片段
        if prefetched_chunks:
            # 添加系统消息，告知 AI 优先使用这些片段回答
            messages.append(
                {
                    # 消息角色为系统
                    'role': 'system',
                    # 系统提示词内容，包含格式化的检索片段
                    'content': (
                        '以下是系统在回答前已从知识库中检索到的高相关片段，请优先基于这些内容回答。'
                        '如果这些片段与问题直接相关，请优先引用它们，并使用 `[1]`、`[2]` 这样的编号标记来源。\n\n'
                        # 调用格式化方法将片段转换为文本
                        f'{self._format_prefetched_context(prefetched_chunks)}'
                    ),
                }
            )
        # 添加用户消息到消息列表
        messages.append({'role': 'user', 'content': message})
        # 返回符合 Agent 输入格式的字典
        return {'messages': messages}

    # 构建 Agent 运行配置的私有方法，输入会话 ID
    def _build_agent_config(self, session_id: str) -> dict:
        """构建 Agent 运行配置。

        根据 LangChain / LangGraph 1.x 的推荐方式，使用 `thread_id`
        作为多轮记忆的主键，把同一会话的上下文串起来。
        """

        # 返回包含线程 ID 的配置字典，用于多轮对话上下文管理
        return {'configurable': {'thread_id': session_id}}

    # 从 Agent 返回结果中提取最终回答的私有方法
    def _extract_final_answer(self, result: dict) -> str:
        """从 Agent 返回状态中提取最后一条 AI 回复。"""

        # 从结果字典中获取消息列表，如果不存在则返回空列表
        messages = result.get('messages', [])
        # 从后向前遍历消息列表，寻找最后一条 AI 消息
        for message in reversed(messages):
            # 检查当前消息是否为 AI 消息类型
            if isinstance(message, AIMessage):
                # 如果消息对象有 text 属性则使用，否则转换 content 为字符串
                content = message.text if hasattr(message, 'text') else str(message.content)
                # 如果内容去除空白后不为空
                if content.strip():
                    # 返回去除首尾空白的内容
                    return content.strip()
        # 如果没有找到有效的 AI 消息，返回空字符串
        return ''

    # 格式化预检索片段为上下文文本的私有方法
    def _format_prefetched_context(self, prefetched_chunks: list[dict]) -> str:
        """把预检索到的片段压缩成适合模型消费的上下文。"""

        # 初始化行列表，用于存储每个片段的格式化文本
        lines: list[str] = []
        # 遍历前 5 个预检索片段，从 1 开始编号
        for index, item in enumerate(prefetched_chunks[:5], start=1):
            # 将每个片段的元数据和内容格式化为多行文本并添加到列表
            lines.append(
                # 使用换行符连接多个字段
                '\n'.join(
                    [
                        # 片段编号和文件名
                        f'[{index}] filename={item.get("filename") or "unknown"}',
                        # 片段的唯一标识符
                        f'chunk_id={item.get("chunk_id") or "unknown"}',
                        # 片段在文档中的索引位置
                        f'chunk_index={item.get("chunk_index")}',
                        # 片段所在的页码
                        f'page_number={item.get("page_number")}',
                        # 检索来源类型（如向量检索、BM25 等）
                        f'retrieval_source={item.get("retrieval_source")}',
                        # 检索相关性分数
                        f'score={item.get("score")}',
                        # 片段内容，最多取前 500 个字符
                        f'content={str(item.get("content") or "")[:500]}',
                    ]
                )
            )
        # 使用双换行符连接所有片段文本，返回最终的上下文字符串
        return '\n\n'.join(lines)

    # 生成来源片段预览的私有方法，用于日志记录
    def _source_preview(self, source_chunks: list[dict]) -> list[dict]:
        # 返回前 3 个来源片段的核心字段，用于简洁的日志输出
        return [
            {
                # 引用编号
                'ref_id': item.get('ref_id'),
                # 片段唯一标识
                'chunk_id': item.get('chunk_id'),
                # 文件名
                'filename': item.get('filename'),
                # 检索来源类型
                'retrieval_source': item.get('retrieval_source'),
                # 综合相关性分数
                'score': item.get('score'),
                # 向量检索分数
                'vector_score': item.get('vector_score'),
                # BM25 检索分数
                'bm25_score': item.get('bm25_score'),
                # 融合后的分数
                'fused_score': item.get('fused_score'),
            }
            # 只取前 3 个片段
            for item in source_chunks[:3]
        ]

    # 规范化来源片段数据结构的私有方法
    def _normalize_source_chunks(self, source_chunks: list[dict]) -> list[dict]:
        """规范化来源字段，保证响应体和日志结构稳定。"""

        # 初始化规范化后的片段列表
        normalized_items: list[dict] = []
        # 遍历所有来源片段，从 1 开始编号
        for index, source_chunk in enumerate(source_chunks or [], start=1):
            # 将每个片段转换为标准化的字典结构并添加到列表
            normalized_items.append(
                {
                    # 引用 ID，如果不存在则使用索引编号
                    'ref_id': int(source_chunk.get('ref_id', index)),
                    # 片段唯一标识符
                    'chunk_id': source_chunk.get('chunk_id'),
                    # 文档 ID
                    'document_id': source_chunk.get('document_id'),
                    # 文件名
                    'filename': source_chunk.get('filename'),
                    # 文件类型
                    'file_type': source_chunk.get('file_type'),
                    # 片段在文档中的索引
                    'chunk_index': source_chunk.get('chunk_index'),
                    # 片段内容文本，默认为空字符串
                    'content': source_chunk.get('content', ''),
                    # 综合相关性分数，转换为浮点数
                    'score': float(source_chunk.get('score', 0.0)),
                    # 向量检索分数，如果存在则转换为浮点数，否则为 None
                    'vector_score': float(source_chunk['vector_score']) if source_chunk.get('vector_score') is not None else None,
                    # BM25 检索分数，如果存在则转换为浮点数，否则为 None
                    'bm25_score': float(source_chunk['bm25_score']) if source_chunk.get('bm25_score') is not None else None,
                    # 融合后的分数，如果存在则转换为浮点数，否则为 None
                    'fused_score': float(source_chunk['fused_score']) if source_chunk.get('fused_score') is not None else None,
                    # 检索来源类型（单个）
                    'retrieval_source': source_chunk.get('retrieval_source'),
                    # 检索来源类型列表（多个），转换为列表类型
                    'retrieval_sources': list(source_chunk.get('retrieval_sources') or []),
                    # 向量检索中的排名
                    'rank_vector': source_chunk.get('rank_vector'),
                    # BM25 检索中的排名
                    'rank_bm25': source_chunk.get('rank_bm25'),
                    # 融合排序后的排名
                    'rank_fused': source_chunk.get('rank_fused'),
                    # 文本分割器名称
                    'splitter_name': source_chunk.get('splitter_name'),
                    # 文档解析器名称
                    'parser_name': source_chunk.get('parser_name'),
                    # 章节类型
                    'section_type': source_chunk.get('section_type'),
                    # 章节标题
                    'section_title': source_chunk.get('section_title'),
                    # 页码
                    'page_number': source_chunk.get('page_number'),
                    # 源文件路径
                    'source_path': source_chunk.get('source_path'),
                    # 片段在原文中的起始偏移量
                    'start_offset': source_chunk.get('start_offset'),
                    # 片段在原文中的结束偏移量
                    'end_offset': source_chunk.get('end_offset'),
                }
            )
        # 返回规范化后的片段列表
        return normalized_items

    # 在 Agent 执行前预先检索知识库的私有方法
    def _prefetch_source_chunks(self, *, message: str, top_k: int) -> list[dict]:
        """在进入 Agent 前先做一次确定性的知识库检索。"""

        # 使用数据库会话上下文管理器
        with self.session_factory() as db:
            # 调用检索函数，从知识库中检索相关片段
            prefetched_hits = retrieve_chunks(db, query=message, top_k=top_k)
        # 对检索结果进行规范化处理
        normalized_hits = self._normalize_source_chunks(prefetched_hits)
        # 记录预检索的详细日志信息
        logger.info(
            # 日志消息格式，包含查询文本、top_k 参数、命中数量和预览
            '[CHAT] prefetch retrieval: query=%r top_k=%s hit_count=%s preview=%s',
            # 查询文本
            message,
            # 检索的片段数量上限
            top_k,
            # 实际命中的片段数量
            len(normalized_hits),
            # 片段预览信息（前3个）
            self._source_preview(normalized_hits),
        )
        # 返回规范化后的检索结果
        return normalized_hits

    # 持久化查询日志到数据库的私有方法
    def _persist_query_log(self, *, session_id: str, question: str, result: ChatRunResult) -> None:
        """把一次问答结果落到查询日志表。"""

        # 使用数据库会话上下文管理器
        with self.session_factory() as db:
            # 创建查询日志对象，包含所有问答相关信息
            query_log = QueryLog(
                # 会话标识符
                session_id=session_id,
                # 用户提出的问题
                user_question=question,
                # AI 生成的回答
                answer=result.answer,
                # 路由类型
                route=result.route,
                # 响应延迟（毫秒）
                latency_ms=result.latency_ms,
                # 来源片段列表
                source_chunks=result.source_chunks,
            )
            # 将查询日志对象添加到数据库会话
            db.add(query_log)
            # 提交事务，将数据持久化到数据库
            db.commit()

    # 将数据库查询日志转换为响应对象的私有方法
    def _serialize_history_item(self, query_log: QueryLog) -> ChatHistoryItem:
        """把数据库查询日志转成接口层响应对象。"""

        # 规范化来源片段数据
        source_chunks = self._normalize_source_chunks(query_log.source_chunks)
        # 返回聊天历史项对象
        return ChatHistoryItem(
            # 查询日志的数据库 ID
            id=query_log.id,
            # 会话标识符
            session_id=query_log.session_id,
            # 用户提出的问题
            user_question=query_log.user_question,
            # AI 生成的回答
            answer=query_log.answer,
            # 路由类型
            route=query_log.route,
            # 响应延迟（毫秒）
            latency_ms=query_log.latency_ms,
            # 将来源片段转换为 Pydantic 模型对象列表
            source_chunks=[SourceChunkItem.model_validate(item) for item in source_chunks],
            # 创建时间戳
            created_at=query_log.created_at,
            # 更新时间戳
            updated_at=query_log.updated_at,
        )

    # 上下文管理器装饰器，用于为单次问答绑定检索追踪容器
    @contextmanager
    def _chat_run(self, *, top_k: int) -> Generator[RetrievalTrace, None, None]:
        """为一次问答绑定独立的检索溯源容器。"""

        # 创建检索追踪对象，指定 top_k 参数
        trace = RetrievalTrace(top_k=top_k)
        # 使用检索追踪上下文管理器，将追踪对象绑定到当前上下文
        with bind_retrieval_trace(trace):
            # 生成追踪对象供调用方使用
            yield trace

    # 执行同步问答的公共方法
    def invoke(self, *, session_id: str, message: str, top_k: int = 5) -> ChatResponse:
        """执行一次同步问答。"""

        # 记录性能计时的起始时间点
        started_at = time.perf_counter()
        # 记录问答开始的日志信息
        logger.info(
            # 日志消息格式
            '[CHAT] invoke started: session=%s top_k=%s message_length=%s message_preview=%r',
            # 会话 ID
            session_id,
            # 检索片段数量上限
            top_k,
            # 用户消息的字符长度
            len(message),
            # 消息的前 120 个字符预览
            message[:120],
        )
        # 异常捕获块，处理 Agent 执行过程中的错误
        try:
            # 使用检索追踪上下文管理器
            with self._chat_run(top_k=top_k) as trace:
                # 预先从知识库检索相关片段
                prefetched_chunks = self._prefetch_source_chunks(message=message, top_k=top_k)
                # 如果检索到了片段
                if prefetched_chunks:
                    # 将片段添加到追踪对象中
                    trace.source_chunks = prefetched_chunks
                # 调用 Agent 执行问答，传入构建好的输入和配置
                result = self.agent.invoke(
                    # 构建包含用户消息和预检索片段的输入
                    self._build_agent_input(message, prefetched_chunks),
                    # 构建包含会话配置的参数
                    config=self._build_agent_config(session_id),
                )
        # 捕获所有异常，使用 noqa 忽略 BLE001 检查
        except Exception as exc:  # noqa: BLE001
            # 记录异常日志，包含完整的堆栈跟踪
            logger.exception('Chat invoke failed for session=%s', session_id)
            # 抛出运行时错误，包含原始异常信息
            raise RuntimeError(f'Agent 对话执行失败: {exc}') from exc

        # 从 Agent 返回结果中提取最终回答
        answer = self._extract_final_answer(result)
        # 计算响应延迟，转换为毫秒整数
        latency_ms = int((time.perf_counter() - started_at) * 1000)
        # 规范化来源片段数据
        source_chunks = self._normalize_source_chunks(trace.source_chunks)
        # 构建聊天运行结果对象
        chat_result = ChatRunResult(
            # 会话 ID
            session_id=session_id,
            # AI 回答
            answer=answer,
            # 响应延迟
            latency_ms=latency_ms,
            # 来源片段
            source_chunks=source_chunks,
        )
        # 持久化查询日志到数据库
        self._persist_query_log(session_id=session_id, question=message, result=chat_result)
        # 记录问答完成的日志信息
        logger.info(
            # 日志消息格式
            '[CHAT] invoke finished: session=%s latency_ms=%s answer_length=%s source_chunk_count=%s source_preview=%s',
            # 会话 ID
            session_id,
            # 响应延迟
            latency_ms,
            # 回答文本的字符长度
            len(answer),
            # 来源片段数量
            len(source_chunks),
            # 片段预览（前3个）
            self._source_preview(source_chunks),
        )

        # 返回聊天响应对象
        return ChatResponse(
            # 会话 ID
            session_id=session_id,
            # AI 回答
            answer=answer,
            # 响应延迟
            latency_ms=latency_ms,
            # 将来源片段转换为 Pydantic 模型对象列表
            source_chunks=[SourceChunkItem.model_validate(item) for item in source_chunks],
            # 创建时间戳
            created_at=chat_result.created_at,
        )

    # 以 SSE（服务器发送事件）方式流式返回问答结果的公共方法
    def stream(self, *, session_id: str, message: str, top_k: int = 5) -> Generator[str, None, None]:
        """以 SSE 方式流式返回问答结果。"""

        # 记录性能计时的起始时间点
        started_at = time.perf_counter()
        # 初始化回答片段列表，用于收集流式返回的文本片段
        answer_fragments: list[str] = []
        # 创建检索追踪对象
        trace = RetrievalTrace(top_k=top_k)

        # 记录流式问答开始的日志信息
        logger.info(
            # 日志消息格式
            '[CHAT] stream started: session=%s top_k=%s message_length=%s message_preview=%r',
            # 会话 ID
            session_id,
            # 检索片段数量上限
            top_k,
            # 用户消息的字符长度
            len(message),
            # 消息的前 120 个字符预览
            message[:120],
        )
        # 发送开始状态的 SSE 事件
        yield format_sse_event('status', {'phase': 'started', 'session_id': session_id})
        # 异常捕获块，处理流式对话过程中的错误
        try:
            # 预先从知识库检索相关片段
            prefetched_chunks = self._prefetch_source_chunks(message=message, top_k=top_k)
            # 如果检索到了片段
            if prefetched_chunks:
                # 将片段添加到追踪对象中
                trace.source_chunks = prefetched_chunks
                # 发送来源片段的 SSE 事件
                yield format_sse_event(
                    # 事件类型为 sources
                    'sources',
                    # 事件数据包含检索到的片段列表
                    {
                        'items': prefetched_chunks,
                    },
                )
                # 发送检索完成状态的 SSE 事件
                yield format_sse_event(
                    # 事件类型为 status
                    'status',
                    # 事件数据包含阶段、会话 ID 和片段数量
                    {
                        'phase': 'retrieved',
                        'session_id': session_id,
                        'source_chunk_count': len(prefetched_chunks),
                    },
                )
            # 使用检索追踪上下文管理器
            with bind_retrieval_trace(trace):
                # 记录调用 Agent 的日志信息
                logger.info(
                    # 日志消息格式
                    '[CHAT] stream calling agent: session=%s thread_id=%s prefetched_hits=%s',
                    # 会话 ID
                    session_id,
                    # 从配置中获取线程 ID
                    self._build_agent_config(session_id).get('configurable', {}).get('thread_id'),
                    # 预检索片段数量
                    len(prefetched_chunks),
                )
                # 遍历 Agent 的流式输出，包含更新和消息两种模式
                for stream_mode, chunk in self.agent.stream(
                    # 构建包含用户消息和预检索片段的输入
                    self._build_agent_input(message, prefetched_chunks),
                    # 构建包含会话配置的参数
                    config=self._build_agent_config(session_id),
                    # 指定流式模式为更新和消息
                    stream_mode=['updates', 'messages'],
                ):
                    # 如果流式模式为消息
                    if stream_mode == 'messages':
                        # 解包消息令牌和元数据
                        token, metadata = chunk
                        # 如果消息不是来自 model 节点，跳过处理
                        if metadata.get('langgraph_node') != 'model':
                            continue
                        # 获取内容块列表，如果不存在则使用空列表
                        content_blocks = getattr(token, 'content_blocks', []) or []
                        # 遍历每个内容块
                        for block in content_blocks:
                            # 如果块类型不是文本，跳过处理
                            if block.get('type') != 'text':
                                continue

                            # 获取文本增量内容
                            text_delta = block.get('text', '')
                            # 如果文本为空，跳过处理
                            if not text_delta:
                                continue

                            # 将文本片段添加到回答片段列表
                            answer_fragments.append(text_delta)
                            # 发送文本令牌的 SSE 事件
                            yield format_sse_event('token', {'text': text_delta})
                        # 继续处理下一个流式输出
                        continue

                    # 如果流式模式不是 updates，跳过处理
                    if stream_mode != 'updates':
                        continue

                    # 获取更新块数据
                    update_chunk = chunk
                    # 遍历更新块中的每个步骤
                    for step_name, step_data in update_chunk.items():
                        # 获取步骤中的消息列表
                        messages = step_data.get('messages', [])
                        # 如果消息列表为空，跳过处理
                        if not messages:
                            continue

                        # 获取最后一条消息
                        latest_message = messages[-1]
                        # 如果最后一条消息是 AI 消息
                        if isinstance(latest_message, AIMessage):
                            # 获取工具调用列表
                            tool_calls = latest_message.tool_calls or []
                            # 遍历每个工具调用
                            for tool_call in tool_calls:
                                # 发送工具调用的 SSE 事件
                                yield format_sse_event(
                                    # 事件类型为 tool_call
                                    'tool_call',
                                    # 事件数据包含步骤名、工具名、调用 ID 和参数
                                    {
                                        'step': step_name,
                                        'tool_name': tool_call.get('name'),
                                        'tool_call_id': tool_call.get('id'),
                                        'args': tool_call.get('args'),
                                    },
                                )
                        # 如果最后一条消息是工具消息
                        elif isinstance(latest_message, ToolMessage):
                            # 获取工具执行状态，默认为 success
                            tool_status = getattr(latest_message, 'status', 'success') or 'success'
                            # 发送工具结果或错误的 SSE 事件
                            yield format_sse_event(
                                # 根据状态决定事件类型
                                'tool_error' if tool_status == 'error' else 'tool_result',
                                # 事件数据包含步骤名、调用 ID、状态和内容
                                {
                                    'step': step_name,
                                    'tool_call_id': latest_message.tool_call_id,
                                    'status': tool_status,
                                    'content': str(latest_message.content),
                                },
                            )
        # 捕获所有异常，使用 noqa 忽略 BLE001 检查
        except Exception as exc:  # noqa: BLE001
            # 记录异常日志，包含完整的堆栈跟踪
            logger.exception('Chat stream failed for session=%s', session_id)
            # 发送错误的 SSE 事件
            yield format_sse_event(
                # 事件类型为 error
                'error',
                # 事件数据包含会话 ID 和错误消息
                {
                    'session_id': session_id,
                    'message': f'Agent 流式对话执行失败: {exc}',
                },
            )
            # 发送完成状态的 SSE 事件，标记执行失败
            yield format_sse_event('done', {'session_id': session_id, 'ok': False})
            # 提前返回，结束生成器
            return

        # 将所有回答片段连接成完整回答，并去除首尾空白
        answer = ''.join(answer_fragments).strip()
        # 计算响应延迟，转换为毫秒整数
        latency_ms = int((time.perf_counter() - started_at) * 1000)
        # 规范化来源片段数据
        source_chunks = self._normalize_source_chunks(trace.source_chunks)
        # 记录流式问答完成的日志信息
        logger.info(
            # 日志消息格式
            '[CHAT] stream finished: session=%s latency_ms=%s answer_length=%s source_chunk_count=%s source_preview=%s',
            # 会话 ID
            session_id,
            # 响应延迟
            latency_ms,
            # 回答文本的字符长度
            len(answer),
            # 来源片段数量
            len(source_chunks),
            # 片段预览（前3个）
            self._source_preview(source_chunks),
        )
        # 构建聊天运行结果对象
        chat_result = ChatRunResult(
            # 会话 ID
            session_id=session_id,
            # AI 回答
            answer=answer,
            # 响应延迟
            latency_ms=latency_ms,
            # 来源片段
            source_chunks=source_chunks,
        )
        # 持久化查询日志到数据库
        self._persist_query_log(session_id=session_id, question=message, result=chat_result)

        # 发送最终来源片段的 SSE 事件
        yield format_sse_event(
            # 事件类型为 sources
            'sources',
            # 事件数据包含规范化后的片段列表
            {
                'items': source_chunks,
            },
        )
        # 发送完成状态的 SSE 事件
        yield format_sse_event(
            # 事件类型为 done
            'done',
            # 事件数据包含会话 ID、完整回答、路由、延迟和时间戳
            {
                'session_id': session_id,
                'answer': answer,
                'route': chat_result.route,
                'latency_ms': latency_ms,
                'created_at': chat_result.created_at.isoformat(),
            },
        )

    # 清空指定会话的历史记录和记忆的公共方法
    def clear_session(self, session_id: str) -> SessionClearResponse:
        """清空会话日志，并尝试清空 Agent 短期记忆。"""

        # 使用数据库会话上下文管理器
        with self.session_factory() as db:
            # 构建删除语句，删除指定会话的所有查询日志
            statement = delete(QueryLog).where(QueryLog.session_id == session_id)
            # 执行删除语句
            result = db.execute(statement)
            # 提交事务
            db.commit()

        # 初始化记忆清空标志为 False
        cleared_memory = False
        # 异常捕获块，处理清空记忆时的错误
        try:
            # 尝试清空线程记忆
            cleared_memory = clear_thread_memory(session_id)
        # 捕获所有异常，使用 noqa 忽略 BLE001 检查
        except Exception as exc:  # noqa: BLE001
            # 记录警告日志，记录清空记忆失败的信息
            logger.warning('Failed to clear thread memory for session=%s: %s', session_id, exc)

        # 返回会话清空响应对象
        return SessionClearResponse(
            # 会话 ID
            session_id=session_id,
            # 被删除的查询日志数量
            deleted_query_log_count=int(result.rowcount or 0),
            # 是否成功清空记忆
            cleared_memory=cleared_memory,
        )

    # 获取指定会话的历史记录的公共方法
    def get_session_history(self, session_id: str, *, limit: int = 50) -> list[ChatHistoryItem]:
        """按会话 ID 返回最近的问答历史。"""

        # 使用数据库会话上下文管理器
        with self.session_factory() as db:
            # 构建查询语句
            statement = (
                # 选择查询日志表
                select(QueryLog)
                # 过滤指定会话 ID 的记录
                .where(QueryLog.session_id == session_id)
                # 按创建时间升序排列
                .order_by(QueryLog.created_at.asc())
                # 限制返回的记录数量
                .limit(limit)
            )
            # 执行查询并获取所有结果
            query_logs = db.execute(statement).scalars().all()
        # 将查询日志转换为聊天历史项列表并返回
        return [self._serialize_history_item(query_log) for query_log in query_logs]

    # 列出所有会话摘要的公共方法
    def list_sessions(self, *, limit: int = 50) -> list[SessionSummaryItem]:
        """返回会话摘要列表，便于前端展示最近会话。"""

        # 使用数据库会话上下文管理器
        with self.session_factory() as db:
            # 构建子查询，用于获取每个会话的最新创建时间和消息数量
            latest_created_at_subquery = (
                # 选择会话 ID、最大创建时间和消息数量
                select(
                    # 会话 ID 字段，添加标签
                    QueryLog.session_id.label('session_id'),
                    # 获取每个会话的最新创建时间
                    func.max(QueryLog.created_at).label('latest_created_at'),
                    # 计算每个会话的消息数量
                    func.count(QueryLog.id).label('message_count'),
                )
                # 过滤掉 session_id 为空的记录
                .where(QueryLog.session_id.is_not(None))
                # 按会话 ID 分组
                .group_by(QueryLog.session_id)
                # 转换为子查询对象
                .subquery()
            )

            # 构建主查询语句
            statement = (
                # 选择查询日志和消息数量
                select(QueryLog, latest_created_at_subquery.c.message_count)
                # 连接子查询，匹配会话 ID 和最新创建时间
                .join(
                    latest_created_at_subquery,
                    # 连接条件：会话 ID 相同且创建时间为该会话的最新时间
                    (QueryLog.session_id == latest_created_at_subquery.c.session_id)
                    & (QueryLog.created_at == latest_created_at_subquery.c.latest_created_at),
                )
                # 按创建时间降序排列
                .order_by(desc(QueryLog.created_at))
                # 限制返回的记录数量
                .limit(limit)
            )
            # 执行查询并获取所有结果
            rows = db.execute(statement).all()

        # 将查询结果转换为会话摘要项列表并返回
        return [
            # 创建会话摘要项对象
            SessionSummaryItem(
                # 会话 ID，如果为空则使用空字符串
                session_id=query_log.session_id or '',
                # 最新的问题
                latest_question=query_log.user_question,
                # 最新的回答
                latest_answer=query_log.answer,
                # 消息数量，转换为整数
                message_count=int(message_count or 0),
                # 更新时间戳
                updated_at=query_log.updated_at,
            )
            # 遍历所有查询结果行
            for query_log, message_count in rows
            # 过滤掉 session_id 为空的记录
            if query_log.session_id
        ]
