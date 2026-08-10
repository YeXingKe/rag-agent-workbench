"""
Chunk 模型

存储文档切分后的文本块
"""

import uuid
from sqlalchemy import String, Integer, Text, JSON, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin


class Chunk(Base, TimestampMixin):
    """
    Chunk 表
    
    存储切分后的文本块及其元数据
    这是 RAG 系统最核心的表
    """
    
    __tablename__ = 'chunk'
    
    # 主键
    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
        comment="Chunk ID"
    )
    
    # 外键：关联文档
    document_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey('document.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
        comment="所属文档 ID"
    )
    
    # 序号
    chunk_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="在文档中的序号（从 0 开始）"
    )
    
    # 文本内容
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Chunk 文本内容"
    )
    
    # 元数据（JSON 格式）
    metadata_json: Mapped[dict] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
        comment="元数据（页码、标题、章节等）"
    )
    
    # Token 统计
    token_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Token 数量"
    )
    
    # 位置信息
    page_number: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="来源页码"
    )
    
    start_offset: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="在原文中的起始位置"
    )
    
    end_offset: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="在原文中的结束位置"
    )
    
    # 向量 ID（Milvus 中的 ID）
    vector_id: Mapped[str | None] = mapped_column(
        String(128),
        nullable=True,
        index=True,
        comment="Milvus 向量 ID"
    )
    
    # 是否启用
    enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="是否参与检索"
    )
    
    # 关系：多个 Chunk 属于一个文档
    document: Mapped["Document"] = relationship(
        "Document",
        back_populates="chunks"
    )
    
    def __repr__(self) -> str:
        """字符串表示"""
        content_preview = self.content[:50] + "..." if len(self.content) > 50 else self.content
        return (
            f"<Chunk(id={self.id}, "
            f"document_id={self.document_id}, "
            f"index={self.chunk_index}, "
            f"content='{content_preview}')>"
        )
