# RAG Agent Workbench

一个基于 Python FastAPI 后端和 React + Ant Design 前端的 RAG（检索增强生成）智能体工作台。

## 技术栈

### 后端
- **Python 3.x**
- **FastAPI** - 现代、快速的 Web 框架
- **SQLAlchemy** - ORM 数据库映射
- **LangChain** - LLM 应用开发框架
- **LangGraph** - 状态图构建工具

### 数据层
- **PostgreSQL** - 关系型数据库
- **Milvus** - 向量数据库
- **Redis** - 缓存和会话存储

### 模型层
- **DashScope (通义千问)** - 阿里云大模型
- **Baidu OCR** - 百度文字识别

### 前端
- **React 18**
- **TypeScript**
- **Ant Design 5**
- **React Router 6**
- **Vite**

## 项目结构

```
RAG-Agent-Workbench/
├── server/              # Python FastAPI 后端
│   ├── app/
│   │   ├── api/         # API 路由
│   │   ├── models/      # SQLAlchemy 模型
│   │   ├── services/    # 业务逻辑（LLM、OCR、文档）
│   │   ├── database.py  # 数据库连接
│   │   ├── redis_client.py   # Redis 客户端
│   │   ├── milvus_client.py  # Milvus 客户端
│   │   └── config.py    # 配置管理
│   ├── alembic/         # 数据库迁移
│   ├── main.py
│   └── requirements.txt
├── web/                 # React 前端
│   ├── src/
│   │   ├── components/  # 组件
│   │   ├── pages/       # 页面
│   │   └── services/    # API 服务
│   └── package.json
├── start.bat            # Windows 启动脚本
├── start.sh             # Linux/Mac 启动脚本
└── package.json         # 根目录 npm 脚本
```

## 环境准备

### 依赖服务

项目需要以下服务运行：

**PostgreSQL (数据库):**
```bash
docker run -d --name postgres \
  -e POSTGRES_PASSWORD=your_password \
  -e POSTGRES_DB=rag_workbench \
  -p 5432:5432 postgres:16
```

**Redis (缓存):**
```bash
docker run -d --name redis \
  -p 6379:6379 redis:7
```

**Milvus (向量数据库):**
```bash
docker run -d --name milvus \
  -p 19530:19530 -p 9091:9091 \
  milvusdb/milvus:latest
```

### API 密钥

需要申请以下服务的 API 密钥：
- **DashScope (通义千问)**: https://dashscope.aliyun.com/
- **百度 OCR**: https://cloud.baidu.com/product/ocr

### 方式一：使用启动脚本（推荐）

**Windows:**
```bash
start.bat
```

**Linux/Mac:**
```bash
chmod +x start.sh
./start.sh
```

### 方式二：使用 npm 命令

```bash
# 安装根目录依赖
npm install

# 同时启动后端和前端
npm run dev

# 或者分别启动
npm run dev:server  # 启动后端
npm run dev:web     # 启动前端

# 安装所有依赖（首次运行）
npm run install:all
```

### 方式三：手动启动

**后端服务:**
```bash
cd server
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python main.py
```

**前端应用:**
```bash
cd web
npm install
cp .env.example .env
npm run dev
```

访问地址：
- 后端服务：http://localhost:5000
- 前端应用：http://localhost:3000

## 技术栈

### 后端
- Python 3.x
- Flask 3.0
- Flask-CORS
- Werkzeug

### 前端
- React 18
- TypeScript
- Ant Design 5
- React Router 6
- Vite

## 开发指南

详细的开发文档请参考：
- [后端文档](./server/README.md)
- [前端文档](./web/README.md)
