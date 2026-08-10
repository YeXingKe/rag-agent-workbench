"""
PostgreSQL 数据库连接

提供数据库引擎和会话管理
"""

from functools import lru_cache
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.config import settings


def _postgres_url(dsn: str) -> str:
    """使用已安装的 psycopg v3 驱动（Python 3.13 无可用的 psycopg2 wheel）。"""
    if dsn.startswith("postgresql://"):
        return "postgresql+psycopg://" + dsn.removeprefix("postgresql://")
    if dsn.startswith("postgres://"):
        return "postgresql+psycopg://" + dsn.removeprefix("postgres://")
    return dsn


@lru_cache(maxsize=1)
def get_engine():
    """
    获取数据库引擎（单例）
    
    Returns:
        Engine: SQLAlchemy 引擎对象
    """
    engine = create_engine(
        _postgres_url(settings.postgres_dsn),
        echo=settings.debug,  # 开发环境打印 SQL
        pool_size=5,          # 连接池大小
        max_overflow=10,      # 最大溢出连接数
        connect_args={"connect_timeout": 5},
    )
    return engine


# 创建 Session 工厂
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=get_engine()
)


def get_db() -> Session:
    """
    获取数据库会话
    
    用于依赖注入，自动管理会话生命周期
    
    使用示例：
        @app.get("/items")
        def read_items(db: Session = Depends(get_db)):
            items = db.query(Item).all()
            return items
    
    Yields:
        Session: 数据库会话
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
