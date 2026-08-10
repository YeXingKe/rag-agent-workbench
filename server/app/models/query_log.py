"""
查询日志模型

存储用户问答记录
"""

import uuid
from sqlalchemy import String, Integer, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, TimestampMixin


class QueryLog(Base, TimestampMixin):
    """
    查询日志表
    
    记录每次问答的详细信息
    """
    
    __tablename__ = 'query_log'
    
    # 主键
    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
        comment="日志 ID"
    )
    
    # 会话 ID（同一个对话中的多轮问答共享）
    session_id: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        index=True,
        comment="会话 ID"
    )
    
    # 问答内容
    user_question: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="用户问题"
    )
    
    answer: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="AI 回答"
    )
    
    # 处理信息
    route: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default='rag',
        comment="处理路由（rag/sql/web/direct）"
    )
    
    response_time: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="响应时间（毫秒）"
    )
    
    # 来源 Chunk（JSON 数组）
    source_chunks: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        default=list,
        comment="引用的 Chunk 列表"
    )
    
    def __repr__(self) -> str:
        """字符串表示"""
        question_preview = self.user_question[:30] + "..." if len(self.user_question) > 30 else self.user_question
        return (
            f"<QueryLog(id={self.id}, "
            f"question='{question_preview}', "
            f"session_id={self.session_id})>"
        )
