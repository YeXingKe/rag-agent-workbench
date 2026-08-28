-- =============================================================================
-- RAG Agent Workbench 初始化脚本
-- 在 pgAdmin 中：用有权限的账号（postgres / 库 owner）连接到 rag_db，打开 Query Tool 执行本文件。
-- =============================================================================

-- 1) 给业务用户授权（PostgreSQL 15+ 默认 public 可能禁止普通用户建表）
GRANT USAGE, CREATE ON SCHEMA public TO "testUser";
GRANT ALL PRIVILEGES ON SCHEMA public TO "testUser";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "testUser";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "testUser";

-- 2) 业务表
CREATE TABLE IF NOT EXISTS document (
  id VARCHAR(36) PRIMARY KEY,
  knowledge_base VARCHAR(100) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  file_type VARCHAR(32) NOT NULL,
  source_path VARCHAR(500),
  file_size BIGINT,
  status VARCHAR(32) NOT NULL DEFAULT 'uploaded',
  chunk_count INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_document_knowledge_base ON document (knowledge_base);

CREATE TABLE IF NOT EXISTS chunk (
  id VARCHAR(36) PRIMARY KEY,
  document_id VARCHAR(36) NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_count INTEGER NOT NULL DEFAULT 0,
  page_number INTEGER,
  start_offset INTEGER,
  end_offset INTEGER,
  vector_id VARCHAR(128),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_chunk_document_id ON chunk (document_id);
CREATE INDEX IF NOT EXISTS ix_chunk_vector_id ON chunk (vector_id);
CREATE INDEX IF NOT EXISTS ix_chunk_enabled ON chunk (enabled);

CREATE TABLE IF NOT EXISTS query_log (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(100),
  user_question TEXT NOT NULL,
  answer TEXT,
  route VARCHAR(50) NOT NULL DEFAULT 'rag',
  latency_ms INTEGER,
  source_chunks JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_query_log_session_id ON query_log (session_id);

-- 3) 把已有表的权限也授给业务用户
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "testUser";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "testUser";
