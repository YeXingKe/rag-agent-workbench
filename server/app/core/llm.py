# 启用未来注解语法，支持更现代的类型标注写法
from __future__ import annotations

# 导入通义千问聊天模型封装，作为当前项目的具体 LLM 实现
from langchain_community.chat_models.tongyi import ChatTongyi
# 导入聊天模型抽象基类，便于对外返回统一类型而非绑定具体实现
from langchain_core.language_models import BaseChatModel

# 读取应用配置，获取模型名与 API Key 等参数
from app.config import get_settings


def get_llm(*, streaming: bool = False, temperature: float = 0.1) -> BaseChatModel:
    """返回项目统一使用的聊天模型实例。

    说明：
    - 在本项目当前依赖组合下，Tongyi 的稳定调用入口仍可通过 `ChatTongyi` 使用；
    - 后续接入 Agent 时，业务层不应该直接依赖具体实现类，因此这里返回
      `BaseChatModel` 抽象类型，便于后续平滑替换实现。
    """

    # 加载当前运行配置（模型名、DashScope Key 等）
    settings = get_settings()
    # 创建并返回通义千问聊天模型实例
    return ChatTongyi(
        # 使用配置中的模型名称
        model_name=settings.model,
        # 使用配置中的 DashScope API Key 进行鉴权
        dashscope_api_key=settings.dashscope_api_key,
        # 是否启用流式输出（逐 token/片段返回）
        streaming=streaming,
        # 采样温度：越低输出越稳定、越确定
        temperature=temperature,
    )
