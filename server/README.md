# Server

Python FastAPI 后端服务

## 技术栈

### 后端框架
- **FastAPI** - 现代、快速的 Web 框架
- **SQLAlchemy** - ORM 数据库映射
- **Pydantic** - 数据验证

### 数据层
- **PostgreSQL** - 关系型数据库
- **Milvus** - 向量数据库
- **Redis** - 缓存和会话存储

### AI & LLM
- **LangChain** - LLM 应用开发框架
- **LangGraph** - 状态图构建工具
- **DashScope (通义千问)** - 阿里云大模型
- **Baidu OCR** - 百度文字识别

## 项目结构

```
server/
├── app/
│   ├── api/              # API 路由
│   │   ├── health.py     # 健康检查
│   │   └── __init__.py
│   ├── models/           # SQLAlchemy 模型
│   │   ├── base.py       # 基础模型
│   │   └── __init__.py
│   ├── services/         # 业务逻辑
│   │   ├── llm_service.py       # LLM 服务
│   │   ├── ocr_service.py       # OCR 服务
│   │   ├── document_service.py  # 文档服务
│   │   └── __init__.py
│   ├── database.py       # 数据库连接
│   ├── redis_client.py   # Redis 客户端
│   ├── milvus_client.py  # Milvus 客户端
│   ├── config.py         # 配置管理
│   └── __init__.py       # 应用工厂
├── alembic/              # 数据库迁移
├── main.py               # 应用入口
└── requirements.txt      # 依赖包
```

## 环境准备

### 1. 安装依赖服务

**PostgreSQL:**
```bash
# 使用 Docker
docker run -d \
  --name postgres \
  -e POSTGRES_PASSWORD=your_password \
  -e POSTGRES_DB=rag_workbench \
  -p 5432:5432 \
  postgres:16
```

**Redis:**
```bash
docker run -d \
  --name redis \
  -p 6379:6379 \
  redis:7
```

**Milvus:**
```bash
docker run -d \
  --name milvus \
  -p 19530:19530 \
  -p 9091:9091 \
  milvusdb/milvus:latest
```

### 2. 安装 Python 依赖

```bash
cd server
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填入相应配置
```

### 4. 初始化数据库

```bash
# 创建迁移
alembic revision --autogenerate -m "Initial migration"

# 执行迁移
alembic upgrade head
```

## 运行服务

```bash
python main.py
```

服务将在 http://localhost:5000 启动

## API 文档

启动服务后访问:
- Swagger UI: http://localhost:5000/docs
- ReDoc: http://localhost:5000/redoc

## API 端点

- `GET /api/health` - 健康检查

## 开发指南

### 添加新模型

在 `app/models/` 中创建模型文件:

```python
from sqlalchemy import Column, Integer, String
from app.database import Base

class YourModel(Base):
    __tablename__ = "your_table"
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255))
```

### 添加新 API 路由

在 `app/api/` 中创建路由文件:

```python
from fastapi import APIRouter

router = APIRouter()

@router.get("/your-endpoint")
async def your_endpoint():
    return {"message": "Hello"}
```

然后在 `app/api/__init__.py` 中注册:

```python
from app.api import your_route
router.include_router(your_route.router, tags=["your-tag"])
```
