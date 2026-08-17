# 启用未来注解语法，支持更现代的类型标注写法
from __future__ import annotations

# 导入日志模块，用于记录异常与告警信息
import logging
# 导入上下文管理器装饰器，便于用 with 绑定/解绑资源
from contextlib import contextmanager
# 导入上下文变量与令牌类型，实现请求级隔离状态
from contextvars import ContextVar, Token
# 导入数据类装饰器与字段工厂，用于定义结构化溯源容器
from dataclasses import dataclass, field
# 导入生成器类型，标注上下文管理器的返回类型
from typing import Generator

# 创建当前模块专用的日志记录器
logger = logging.getLogger(__name__)


# 使用 dataclass 定义检索溯源结构，slots=True 可降低实例内存开销
@dataclass(slots=True)
class RetrievalTrace:
    """记录一次 Agent 调用过程中产生的检索溯源信息。"""

    # 默认检索返回的候选片段数量
    top_k: int = 5
    # 存储检索到的源片段列表；每个元素通常是一个 dict
    source_chunks: list[dict] = field(default_factory=list)


# 定义请求级上下文变量，保存当前请求绑定的检索溯源对象
_current_retrieval_trace: ContextVar[RetrievalTrace | None] = ContextVar(
    # 上下文变量名称，便于调试识别
    'current_retrieval_trace',
    # 未绑定时默认值为 None，表示当前没有可用溯源容器
    default=None,
)


# 将函数包装为上下文管理器，供 with 语句使用
@contextmanager
def bind_retrieval_trace(trace: RetrievalTrace) -> Generator[RetrievalTrace, None, None]:
    """把当前请求的检索溯源容器绑定到上下文。

    之所以使用 `contextvars` 而不是全局变量，是为了保证：
    - 多请求并发时互不串数据；
    - Agent工具函数无需感知 FastAPI 请求对象；
    - 以后切到异步工具或更多工具时仍然能复用同一机制。
    """

    # 将传入的溯源对象写入当前上下文，并拿到用于还原的 token
    token: Token[RetrievalTrace | None] = _current_retrieval_trace.set(trace)
    try:
        # 把绑定好的溯源对象交给 with 代码块使用
        yield trace  # 暂停函数，把一个值交出去，之后还能从断点继续执行
    finally:
        try:
            # 正常路径：用 token 精确还原到进入 with 之前的上下文状态
            _current_retrieval_trace.reset(token)
        except ValueError:
            # StreamingResponse may resume/close the generator in a different context.
            # In that case, best-effort clear the current trace instead of failing the whole request.
            # 跨上下文边界无法 reset 时，记录告警并尽量清空当前溯源，避免请求失败
            logger.warning('Retrieval trace token reset crossed context boundary; falling back to clear current trace')
            # 兜底：将当前上下文中的溯源值显式置为 None
            _current_retrieval_trace.set(None)


def get_current_retrieval_trace() -> RetrievalTrace | None:
    """返回当前上下文中绑定的检索溯源容器。"""

    # 从上下文变量中读取当前绑定的 RetrievalTrace（可能为 None）
    return _current_retrieval_trace.get()
