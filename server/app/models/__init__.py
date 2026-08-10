"""
模型模块导出

方便其他模块导入模型
"""

from app.models.base import Base
from app.models.document import Document
from app.models.chunk import Chunk
from app.models.query_log import QueryLog

# 导出所有模型
__all__ = [
    'Base',
    'Document',
    'Chunk',
    'QueryLog',
]
