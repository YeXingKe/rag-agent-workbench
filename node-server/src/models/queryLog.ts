import { randomUUID } from 'node:crypto';

import type { Queryable } from '../core/postgres.js';

export interface QueryLogRow {
  id: string;
  session_id: string | null;
  user_question: string;
  answer: string | null;
  route: string;
  latency_ms: number | null;
  source_chunks: unknown[];
  created_at: Date;
  updated_at: Date;
}

export const CREATE_QUERY_LOG_TABLE_SQL = `
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
)
`;

export const CREATE_QUERY_LOG_INDEXES_SQL = [
  `CREATE INDEX IF NOT EXISTS ix_query_log_session_id ON query_log (session_id)`,
];

function asJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapQueryLog(row: Record<string, unknown>): QueryLogRow {
  return {
    id: String(row.id),
    session_id: row.session_id == null ? null : String(row.session_id),
    user_question: String(row.user_question),
    answer: row.answer == null ? null : String(row.answer),
    route: String(row.route),
    latency_ms: row.latency_ms == null ? null : Number(row.latency_ms),
    source_chunks: asJsonArray(row.source_chunks),
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

export interface QueryLogInsertInput {
  id?: string;
  session_id?: string | null;
  user_question: string;
  answer?: string | null;
  route?: string;
  latency_ms?: number | null;
  source_chunks?: unknown[];
}

export async function insertQueryLog(db: Queryable, input: QueryLogInsertInput): Promise<QueryLogRow> {
  const id = input.id ?? randomUUID();
  const result = await db.query(
    `
    INSERT INTO query_log (
      id, session_id, user_question, answer, route, latency_ms, source_chunks
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    RETURNING *
    `,
    [
      id,
      input.session_id ?? null,
      input.user_question,
      input.answer ?? null,
      input.route ?? 'rag',
      input.latency_ms ?? null,
      JSON.stringify(input.source_chunks ?? []),
    ],
  );
  return mapQueryLog(result.rows[0] as Record<string, unknown>);
}

export async function listQueryLogsBySession(db: Queryable, sessionId: string): Promise<QueryLogRow[]> {
  const result = await db.query(
    'SELECT * FROM query_log WHERE session_id = $1 ORDER BY created_at ASC',
    [sessionId],
  );
  return result.rows.map((row) => mapQueryLog(row as Record<string, unknown>));
}
