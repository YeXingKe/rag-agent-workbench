"""
ORM 基类

作用：
1. 定义所有表的公共字段
2. 提供统一的时间戳管理
"""

from datetime import datetime
from sqlalchemy import DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """
    所有 ORM 模型的基类
    
    DeclarativeBase 是 SQLAlchemy 2.0 的基类
    """
    pass


class TimestampMixin:
    """
    时间戳混入类
    
    所有表都会自动添加创建时间和更新时间
    """
    # mapped_column 是 SQLAlchemy 2.0 的属性装饰器，用于将 Python 属性映射到数据库列
    # Mapped 是 SQLAlchemy 2.0 的类型注解，用于指定属性的类型
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False,
        comment="创建时间"
    )
    
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
        comment="更新时间"
    )
