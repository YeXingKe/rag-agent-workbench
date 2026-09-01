# RAG Agent Workbench

面向 RAG（检索增强生成）全链路调试与演示的**智能体工作台**：从文档导入、切分入库、向量检索，到 Agent 问答，提供可视化操作界面与可观测接口。

适合用来学习 / 验证企业知识库 RAG 流程，也适合作为二次开发的脚手架。

---

## 项目能做什么

| 能力 | 说明 |
|------|------|
| **知识导入** | 上传 PDF / DOCX / MD / TXT，或纯文本直接入库 |
| **文档库** | 查看已入库文档，删除、重建索引 |
| **文本切片** | 按文档浏览 Chunk，搜索与在线编辑切片内容 |
| **召回试验** | 调试混合检索（向量 + 关键词等）效果与命中片段 |
| **智能问答** | 基于知识库的 Agent 对话（支持流式输出） |
| **工作台总览** | 系统状态与知识资产概览 |

典型链路：

```text
上传/文本入库 → 解析 & 切分 → Embedding → Milvus
                                      ↓
                        检索调试 / Agent 问答（引用 Chunk）
```

---

## 仓库结构

```text
RAG-Agent-Workbench/
├── web/           # React 前端工作台（Vite + TypeScript + Tailwind）
├── server/        # Python FastAPI 后端（原实现）
├── node-server/   # Node.js Express 后端（与 Python API 1:1 对齐）
├── start.bat / start.sh
└── package.json   # 根目录便捷脚本
```

前后端约定业务前缀：`/api/v1`；健康检查：`GET /health`。

当前前端默认请求：`http://localhost:8000/api/v1`（与 `node-server` / 对齐后的 Python 服务端口一致）。

---

## 技术栈

### 前端 `web/`

- React 18 + TypeScript + Vite
- React Router、Zustand、Axios、Framer Motion、Tailwind CSS 4
- 页面：工作台 / 知识导入 / 文档库 / 文本切片 / 召回试验 / 智能问答

### 后端（二选一或对照开发）

| | `server/`（Python） | `node-server/`（Node） |
|--|---------------------|------------------------|
| 框架 | FastAPI | Express + TypeScript |
| ORM / DB | SQLAlchemy + PostgreSQL | `pg` + PostgreSQL |
| 向量 | Milvus / Zilliz | Milvus / Zilliz |
| 缓存 | Redis | Redis |
| 模型 | DashScope（通义千问） | DashScope（OpenAI 兼容 Chat） |
| Agent | LangChain / LangGraph | ReAct Agent + 短期记忆 |

### 数据与模型依赖

- **PostgreSQL**：文档、Chunk、会话等元数据
- **Milvus / Zilliz Cloud**：向量索引与相似度检索
- **Redis**：缓存 / 会话相关能力
- **DashScope**：Embedding + 对话生成

---

## 核心 API 一览（`/api/v1`）

| 模块 | 代表接口 |
|------|----------|
| 文档 | `POST /documents/upload`、`POST /documents/ingest-text`、`GET /documents`、`DELETE /documents/:id`、`POST /documents/:id/rebuild-index` |
| 切片 | `GET /chunks`、`PATCH /chunks/:id`、`DELETE /chunks/:id` |
| 检索 | `POST /retrieval/search` |
| 问答 | `POST /chat`、`POST /chat/stream`、会话列表 / 历史 / 清空 |
| 系统 | `GET /health`（探测 PG / Redis / Milvus） |

切分策略可通过 `GET /documents/splitters/options` 获取（如 `structured` / `semi_structured` / `unstructured`）。

更完整的 Node 端说明见：[node-server/README.md](./node-server/README.md)。

---

## 快速开始

### 1. 准备依赖服务

需要可用的 PostgreSQL、Redis、Milvus（或 Zilliz），以及 DashScope API Key。

### 2. 配置环境变量

```bash
# Python 后端
cp server/.env.example server/.env

# 或 Node 后端（推荐与前端默认端口对齐）
cp node-server/.env.example node-server/.env

# 前端（如需）
cp web/.env.example web/.env
```

至少配置：数据库连接、`REDIS_URL`、`MILVUS_*` / Token、`DASHSCOPE_API_KEY`，以及 CORS 允许的前端源（如 `http://localhost:3000`）。

建表可参考 `node-server/scripts/init-schema.sql`，或使用 `node-server` 的 `pnpm init-db`。

### 3. 启动

**前端：**

```bash
cd web
pnpm install
pnpm dev
# → http://localhost:3000
```

**Node 后端：**

```bash
cd node-server
pnpm install
pnpm dev
# → http://localhost:8000
# 健康检查：http://localhost:8000/health
```

**Python 后端（可选）：**

```bash
cd server
python -m venv venv
# Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

根目录也可用 `npm run dev` 同时拉起脚本中配置的 Python 后端与前端（以根 `package.json` 为准）。

---

## 设计要点

- **全链路可观测**：导入 → Chunk → 检索命中 → Agent 引用，均可在 UI 中查看与调试
- **双后端对齐**：`node-server` 按参考 FastAPI 服务对齐路径与响应形状，便于用 Node 或 Python 任一侧对接同一前端
- **切分可配置**：入库时可指定切分策略，或交给后端自动推断
- **开发体验**：前端对 GET 做 in-flight 去重，缓解 React Strict Mode 下的重复请求

---

## 文档索引

- [前端说明](./web/README.md)
- [Python 后端说明](./server/README.md)
- [Node 后端说明](./node-server/README.md)
- [Node 小白学习指南](./node-server/docs/小白学习指南.md)（若存在）

---

## License

MIT
