# Node.js Server

TypeScript / Express port of the Python FastAPI backend. HTTP paths, status codes, and JSON shapes are 1:1 with `server/app` APIs.

## Tech stack

- Express 4
- TypeScript ESM (`NodeNext`)
- PostgreSQL (`pg`)
- Milvus
- DashScope (Qwen) via OpenAI-compatible chat
- LangGraph-style ReAct agent (in-memory checkpointer)

## Install

```bash
cd node-server
pnpm install
# or: npm install
```

## Configure

```bash
cp .env.example .env
```

Edit `.env` and set at least:

- `POSTGRES_DSN`
- `DASHSCOPE_API_KEY`
- `MILVUS_COLLECTION`
- `MILVUS_URI` or `MILVUS_HOST` / `MILVUS_PORT`

## Initialize the database

```bash
pnpm init-db
# or: npm run init-db
```

This creates `document`, `chunk`, and `query_log` tables.

## Run

```bash
pnpm dev
# production-style: pnpm start
```

The server listens on `APP_HOST`:`APP_PORT` (defaults: `0.0.0.0:8000`).

Health check: `GET http://localhost:8000/api/health`

## API parity with Python

Mounted under `/api`:

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/health` | `{ status, message }` |
| POST | `/api/documents/ingest-text` | 201 |
| POST | `/api/documents/upload` | multipart `file`, form `knowledge_base`, `preferred_splitter`; 201 |
| GET | `/api/documents` | |
| GET | `/api/documents/splitters/options` | |
| GET | `/api/documents/:document_id` | 404 if missing |
| DELETE | `/api/documents/:document_id` | 204 |
| GET | `/api/documents/:document_id/chunks` | |
| POST | `/api/documents/:document_id/rebuild-index` | |
| GET | `/api/chunks` | query `document_id`, `limit` |
| GET | `/api/chunks/:chunk_id` | |
| PATCH | `/api/chunks/:chunk_id` | |
| DELETE | `/api/chunks/:chunk_id` | 204 |
| POST | `/api/retrieval/search` | `{ query, top_k }` |
| POST | `/api/chat` | sync RAG answer |
| POST | `/api/chat/stream` | SSE: `status`, `sources`, `token`, `tool_call`, `tool_result`, `tool_error`, `error`, `done` |
| GET | `/api/chat/sessions` | |
| GET | `/api/chat/sessions/:session_id/history` | |
| DELETE | `/api/chat/sessions/:session_id` | |

Response field naming matches Python schemas:

- `DocumentItem`: `knowledge_base`, `filename`
- `RetrievalHitItem` / `SourceChunkItem`: `file_name` (mapped from internal `filename`)
