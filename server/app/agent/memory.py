# 启用未来注解语法，支持更现代的类型标注写法
from __future__ import annotations

# 导入日志模块，用于记录记忆存储初始化与异常
import logging
# 导入 Any 类型，用于标注 checkpointer 的动态实现类型
from typing import Any

# 导入内存版 checkpointer，作为 PostgreSQL 不可用时的降级方案
from langgraph.checkpoint.memory import InMemorySaver

# 读取应用配置，获取 PostgreSQL 连接串等设置
from app.config import get_settings

# 创建当前模块专用的日志记录器
logger = logging.getLogger(__name__)

try:
    # 优先尝试导入 PostgreSQL checkpointer，用于持久化多轮对话记忆
    from langgraph.checkpoint.postgres import PostgresSaver
except Exception:  # noqa: BLE001
    # 导入失败时置为 None，后续逻辑会自动降级到内存版
    PostgresSaver = None  # type: ignore[assignment]

# 模块级单例：已初始化的 checkpointer 实例
_checkpointer: Any | None = None
# 模块级单例：PostgreSQL checkpointer 的上下文管理器，用于后续正确关闭
_checkpointer_context_manager: Any | None = None

def _normalize_checkpointer_dsn(dsn: str) -> str:
    """把 SQLAlchemy 风格的 DSN 转回 checkpointer 可直接使用的形式。"""

    # 若是 SQLAlchemy + psycopg 驱动前缀，则改写为标准 postgresql://
    if dsn.startswith('postgresql+psycopg://'):
        return 'postgresql://' + dsn[len('postgresql+psycopg://'):]
    # 其他形式保持原样返回
    return dsn


def initialize_checkpointer() -> Any:
    """初始化 Agent 短期记忆存储。

    设计策略：
    - 优先使用 PostgreSQL checkpointer，满足多轮对话持久化；
    - 如果运行环境缺少依赖或初始化失败，则自动降级到内存版，
      确保本地开发和最小演示链路始终可用。
    """

    # 声明要修改的模块级单例变量
    global _checkpointer, _checkpointer_context_manager

    # 若已初始化过，直接复用现有实例，避免重复创建
    if _checkpointer is not None:
        return _checkpointer

    # 读取当前运行配置
    settings = get_settings()
    # 仅当成功导入 PostgresSaver 时，才尝试走持久化路径
    if PostgresSaver is not None:
        try:
            # 用规范化后的 DSN 创建 PostgreSQL checkpointer 上下文管理器
            _checkpointer_context_manager = PostgresSaver.from_conn_string(
                _normalize_checkpointer_dsn(settings.postgres_dsn)
            )
            # def _normalize_checkpointer_dsn(dsn: str) -> str:
            #     """把 SQLAlchemy 风格的 DSN 转回 checkpointer 可直接使用的形式。"""
            #
            #     if dsn.startswith('postgresql+psycopg://'):
            #         return 'postgresql://' + dsn[len('postgresql+psycopg://'):]
            #     return dsn
            # 进入上下文，拿到真正可用的 checkpointer 对象
            _checkpointer = _checkpointer_context_manager.__enter__()
            # 初始化底层存储结构（如表结构）
            _checkpointer.setup()
            # 记录已成功启用 PostgreSQL 记忆存储
            logger.info('Using PostgreSQL checkpointer for agent memory')
            # 返回持久化版 checkpointer
            return _checkpointer
        except Exception as exc:  # noqa: BLE001
            # 初始化失败时记录告警，准备降级
            logger.warning('Failed to initialize PostgreSQL checkpointer: %s', exc)
            # 若上下文管理器已创建，尽量先关闭，避免资源泄漏
            if _checkpointer_context_manager is not None:
                try:
                    # 主动退出上下文，释放连接等外部资源
                    _checkpointer_context_manager.__exit__(None, None, None)
                except Exception:  # noqa: BLE001
                    # 关闭失败也不阻断降级流程
                    pass
                # 清空失效的上下文管理器引用
                _checkpointer_context_manager = None

    # 降级：使用进程内内存 checkpointer
    _checkpointer = InMemorySaver()
    # 记录当前使用的是内存版记忆存储
    logger.info('Using in-memory checkpointer for agent memory')
    # 返回内存版 checkpointer
    return _checkpointer


def get_checkpointer() -> Any:
    """返回已初始化的 checkpointer。"""

    # 懒加载：首次调用时完成初始化并返回实例
    return initialize_checkpointer()


def clear_thread_memory(thread_id: str) -> bool:
    """清空指定会话线程的短期记忆。

    返回值表示是否成功执行了删除操作。这里做宽松兼容：
    - PostgreSQL checkpointer 提供 `delete_thread`；
    - 内存版若未来接口变动，也只会返回 `False`，不会影响主流程。
    """

    # 获取当前可用的 checkpointer 实例
    checkpointer = get_checkpointer()
    # 动态探测是否支持按线程删除记忆
    delete_thread = getattr(checkpointer, 'delete_thread', None)
    # 不支持删除接口时直接返回失败，避免强依赖具体实现
    if delete_thread is None:
        logger.warning('Current checkpointer does not support delete_thread')
        return False

    # 删除指定 thread_id 对应的短期记忆
    delete_thread(thread_id)
    # 删除调用已成功发出，返回 True
    return True


def shutdown_checkpointer() -> None:
    """释放 checkpointer 持有的外部资源。"""

    # 声明要清理的模块级单例变量
    global _checkpointer, _checkpointer_context_manager

    # 若存在上下文管理器，说明之前启用了需要显式关闭的实现（如 PostgreSQL）
    if _checkpointer_context_manager is not None:
        try:
            # 退出上下文，关闭底层连接等资源
            _checkpointer_context_manager.__exit__(None, None, None)
        except Exception as exc:  # noqa: BLE001
            # 关闭失败只记告警，不抛出，避免影响进程退出
            logger.warning('Failed to close checkpointer cleanly: %s', exc)

    # 清空 checkpointer 实例引用
    _checkpointer = None
    # 清空上下文管理器引用
    _checkpointer_context_manager = None
