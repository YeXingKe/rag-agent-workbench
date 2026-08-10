"""
文档模型

存储上传的文档信息
"""

import uuid
from sqlalchemy import String, BigInteger, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin

# Document(Base, TimestampMixin)
# 继承了 Base 和 TimestampMixin 类
# Base 是 SQLAlchemy 的基类，用于定义表结构
# TimestampMixin 是自定义的混合类，用于添加创建时间和更新时间
class Document(Base, TimestampMixin):
    """
    文档表
    
    存储文档的基本信息和状态
    """
    
    __tablename__ = 'document'
    
    # 主键：使用 UUID 而不是自增 ID
    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
        comment="文档 ID"
    )
    
    # 所属知识库
    knowledge_base_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,  # 添加索引，加快查询
        comment="知识库名称"
    )
    
    # 文件信息
    file_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="原始文件名"
    )
    
    file_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        comment="文件类型（pdf/md/docx/txt）"
    )
    
    source_path: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="文件存储路径"
    )
    
    file_size: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
        comment="文件大小（字节）"
    )
    
    # 状态信息
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default='uploaded',
        comment="文档状态（uploaded/parsed/indexed/failed）"
    )
    
    chunk_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="切分后的 Chunk 数量"
    )
    
    # 摘要信息
    summary: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="文档摘要"
    )
    
    # 关系：一个文档对应多个 Chunk
    chunks: Mapped[list["Chunk"]] = relationship(
        "Chunk",
        back_populates="document",
        cascade="all, delete-orphan"  # 删除文档时，自动删除所有 Chunk
    )
    
    # __repr__ 是 Python 的魔法方法，用于返回对象的字符串表示，命名固定
    def __repr__(self) -> str:
        """字符串表示"""
        return (
            f"<Document(id={self.id}, "
            f"filename={self.file_name}, "
            f"status={self.status})>"
        )
