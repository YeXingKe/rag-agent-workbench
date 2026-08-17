# 启用未来注解语法，支持更现代的类型标注写法
from __future__ import annotations

# 导入日志模块，用于记录工具调用过程
import logging

# 从 pydantic 导入模型基类与字段定义，用于校验工具入参
from pydantic import BaseModel, Field
# 导入 SQLAlchemy Session 类型，便于标注数据库会话
from sqlalchemy.orm import Session

# 从 LangChain 导入 tool 装饰器，把函数注册为 Agent 可调用工具
from langchain.tools import tool

# 获取当前请求绑定的检索溯源容器
from app.agent.runtime import get_current_retrieval_trace
# 获取数据库会话工厂，用于创建 DB Session
from app.core.postgres import get_session_factory
# 执行知识库检索，返回相关 chunk
from app.rag.retriever import retrieve_chunks

# 创建当前模块专用的日志记录器
logger = logging.getLogger(__name__)


class SearchKnowledgeBaseInput(BaseModel):
    """知识库检索工具输入。"""

    # 用户问题或检索关键词
    query: str = Field(description='需要检索的用户问题或关键词')
    # 返回条数，默认 5，范围限制在 1~8
    top_k: int = Field(default=5, ge=1, le=8, description='返回最相关的片段数量')


def _truncate_content(content: str, max_length: int = 400) -> str:
    """把工具返回内容裁剪到适合模型阅读的长度。"""

    # 把连续空白折叠成单个空格，便于后续截断与展示
    # content.split() 会按任意空白字符把字符串拆成单词列表
    normalized = ' '.join(content.split())
    # 若长度未超限，直接返回规范化文本
    if len(normalized) <= max_length:
        return normalized
    # 超长时截断并去掉尾部空白，再追加省略号
    return normalized[:max_length].rstrip() + '...'


#用 pydantic schema 约束工具参数，并注册为 LangChain tool
@tool(args_schema=SearchKnowledgeBaseInput)
def search_knowledge_base(query: str, top_k: int = 5) -> str:
    """检索知识库中与问题最相关的内容片段，并返回可引用的来源编号。

    使用场景：
    - 用户询问项目文档、系统规范、配置说明、知识库内容；
    - 需要基于已入库的 chunk 回答问题；
    - 需要给最终答案附带可追溯来源。
    """

    # 获取可创建数据库会话的工厂
    session_factory = get_session_factory()
    # 打开一个数据库会话，并在退出 with 时自动关闭
    with session_factory() as db:
        # 明确标注 db 为 SQLAlchemy Session，方便类型检查
        db: Session
        # 读取当前上下文中绑定的检索溯源对象（可能为 None）
        trace = get_current_retrieval_trace()
        # 若已绑定 trace，则取请求 top_k 与 trace.top_k 的较小值；否则用原始 top_k
        effective_top_k = min(top_k, trace.top_k) if trace is not None else top_k
        # 记录本次工具调用的关键参数，便于排查
        logger.info(
            '[TOOL][KB] called: query=%r requested_top_k=%s effective_top_k=%s trace_bound=%s',
            query,
            top_k,
            effective_top_k,
            trace is not None,
        )
        # 执行检索，拿到最相关的 chunk 列表
        hits = retrieve_chunks(db, query=query, top_k=effective_top_k)

    # 若没有命中结果，走空结果分支
    if not hits:
        # 记录无命中日志
        logger.info('[TOOL][KB] no hits: query=%r effective_top_k=%s', query, effective_top_k)
        # 若存在溯源容器，清空其中的来源片段
        if trace is not None:
            trace.source_chunks = []
        # 返回给模型可读的空结果提示
        return '未检索到相关知识库内容。'

    # 用于写回溯源的标准化命中列表
    normalized_hits: list[dict] = []
    # 用于拼成最终工具返回文本的行列表
    lines: list[str] = []
    # 从 1 开始编号，遍历每条检索命中
    for index, hit in enumerate(hits, start=1):
        # 复制原 hit，并补充引用编号与截断后的正文
        normalized_hit = {
            **hit,
            'ref_id': index,
            'content': _truncate_content(hit['content']),
        }
        # 收集标准化命中，供后续写入 trace
        normalized_hits.append(normalized_hit)
        # 把单条命中格式化成多行文本，供模型阅读与引用
        lines.append(
            '\n'.join(
                [
                    f'[{index}] filename={hit.get("filename") or "unknown"}',
                    f'chunk_id={hit.get("chunk_id") or "unknown"}',
                    f'chunk_index={hit.get("chunk_index")}',
                    f'page_number={hit.get("page_number")}',
                    f'retrieval_source={hit.get("retrieval_source")}',
                    f'score={hit.get("score")}',
                    f'vector_score={hit.get("vector_score")}',
                    f'bm25_score={hit.get("bm25_score")}',
                    f'fused_score={hit.get("fused_score")}',
                    f'content={normalized_hit["content"]}',
                ]
            )
        )

    # 若存在溯源容器，把标准化命中写回去，供后续回答引用
    if trace is not None:
        trace.source_chunks = normalized_hits
    # 记录返回结果摘要（只预览前 3 条），便于调试
    logger.info(
        '[TOOL][KB] returning hits: query=%r hit_count=%s preview=%s',
        query,
        len(normalized_hits),
        [
            {
                'ref_id': item.get('ref_id'),
                'chunk_id': item.get('chunk_id'),
                'filename': item.get('filename'),
                'retrieval_source': item.get('retrieval_source'),
                'score': item.get('score'),
                'vector_score': item.get('vector_score'),
                'bm25_score': item.get('bm25_score'),
                'fused_score': item.get('fused_score'),
                'content_preview': item.get('content', '')[:120],
            }
            for item in normalized_hits[:3]
        ],
    )

    # 用空行分隔各命中块，返回给 Agent
    return '\n\n'.join(lines)


def get_agent_tools() -> list:
    """返回 Agent 可用工具列表。"""

    # 目前只暴露知识库检索这一个工具
    return [search_knowledge_base]
