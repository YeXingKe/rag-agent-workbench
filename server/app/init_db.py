"""
初始化数据库

创建所有表结构
"""

import sys
from pathlib import Path

# 直接 python init_db.py 时，把 server/ 加入路径，才能 import app
_SERVER_ROOT = Path(__file__).resolve().parent.parent
if str(_SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVER_ROOT))

from app.models import Base
from app.core.postgres import get_engine


def init_db():
    """
    创建所有数据库表
    
    注意：生产环境应该使用 Alembic 迁移
    """
    print("开始创建数据库表...")
    
    engine = get_engine()
    
    # 创建所有表
    Base.metadata.create_all(bind=engine)
    
    print("数据库表创建完成！")
    
    # 打印创建的表
    print("\n已创建的表：")
    for table in Base.metadata.sorted_tables:
        print(f"  - {table.name}")


if __name__ == "__main__":
    init_db()
