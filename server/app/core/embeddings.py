# 启用未来注解语法，支持更现代的类型标注写法
from __future__ import annotations

# 导入 LRU 缓存装饰器，用于把 Embedding 客户端做成进程内单例
from functools import lru_cache

# 导入 DashScope Embedding 实现，负责把文本编码成向量
from langchain_community.embeddings import DashScopeEmbeddings
# 导入 Embedding 抽象基类，对外返回统一类型便于后续替换实现
from langchain_core.embeddings import Embeddings

# 读取应用配置，获取 embedding 模型名与 API Key
from app.config import get_settings


# 只缓存 1 个实例，保证全进程复用同一个 Embedding 客户端
@lru_cache(maxsize=1)
def get_embeddings() -> Embeddings:
    """返回 Embedding 模型单例。

    Embedding 实例通常会在如下场景频繁复用：
    - 文档入库时批量向量化；
    - 查询时把用户问题编码成向量；
    - 可能的重建索引任务。

    因此这里使用单例缓存，避免重复初始化客户端。
    """

    # 加载当前运行配置
    settings = get_settings()
    # 创建并返回 DashScope Embedding 客户端实例
    return DashScopeEmbeddings(
        # 使用配置中的 embedding 模型名称
        model=settings.embedding_model,
        # 使用配置中的 DashScope API Key 进行鉴权
        dashscope_api_key=settings.dashscope_api_key,
    )
