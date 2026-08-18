# Node.js Server

对齐参考实现：`D:\develop\rag_agent_xdclass\backend`（Python FastAPI）。

HTTP 路径、状态码与 JSON 形状与参考服务一致；前端默认请求 `http://localhost:8000/api/v1`。

## Tech stack

- Express 4
- TypeScript ESM (`NodeNext`)
- PostgreSQL (`pg`)
- Milvus
- DashScope (Qwen) via OpenAI-compatible chat
- ReAct Agent + 进程内短期记忆（可后续升级 Postgres checkpointer）

## Install

```bash
cd node-server
pnpm install
```

## Configure

```bash
cp .env.example .env
```

至少配置：`POSTGRES_DSN`、`REDIS_URL`、`DASHSCOPE_API_KEY`、`MILVUS_COLLECTION`、`MILVUS_URI`。

## Run

```bash
pnpm init-db   # 可选：启动时也会自动 create_all
pnpm dev
```

默认监听 `0.0.0.0:8000`。

- 健康检查：`GET http://localhost:8000/health`（探测 postgres / redis / milvus）
- 业务前缀：`/api/v1`

## 完整接口清单（共 19 个，不是 4 个）

参考 Python 有 **4 组业务路由 + 1 个系统健康检查**，展开后是这些端点：

| Method | Path | 说明 |
|--------|------|------|
| GET | `/health` | postgres / redis / milvus 依赖探活 |
| POST | `/api/v1/documents/ingest-text` | 纯文本入库 |
| POST | `/api/v1/documents/upload` | 文件上传入库 |
| GET | `/api/v1/documents` | 文档列表 |
| GET | `/api/v1/documents/splitters/options` | 切分策略 |
| GET | `/api/v1/documents/:document_id` | 文档详情 |
| DELETE | `/api/v1/documents/:document_id` | 删除文档 |
| GET | `/api/v1/documents/:document_id/chunks` | 文档下 chunk |
| POST | `/api/v1/documents/:document_id/rebuild-index` | 重建索引 |
| GET | `/api/v1/chunks` | chunk 列表 |
| GET | `/api/v1/chunks/:chunk_id` | chunk 详情 |
| PATCH | `/api/v1/chunks/:chunk_id` | 编辑 chunk |
| DELETE | `/api/v1/chunks/:chunk_id` | 删除 chunk |
| POST | `/api/v1/retrieval/search` | 混合检索调试 |
| POST | `/api/v1/chat` | 同步问答 |
| POST | `/api/v1/chat/stream` | SSE 流式问答 |
| GET | `/api/v1/chat/sessions` | 会话列表 |
| GET | `/api/v1/chat/sessions/:session_id/history` | 会话历史 |
| DELETE | `/api/v1/chat/sessions/:session_id` | 清空会话 |

SSE 事件：`status` / `sources` / `token` / `tool_call` / `tool_result` / `tool_error` / `error` / `done`

## 响应字段约定

- `DocumentItem`：`knowledge_base`、`filename`
- `RetrievalHitItem` / `SourceChunkItem`：对外 `file_name`（内部检索用 `filename`）
