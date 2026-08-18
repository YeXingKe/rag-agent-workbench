/**
 * QueryLog 表模型与 CRUD
 *
 * 记录问答会话的问题、回答、路由与耗时，便于审计与调试。
 */
import { randomUUID } from 'node:crypto';

import type { Queryable } from '../core/postgres.js';

/**
 * query_log 表一行的 TypeScript 映射。
 *
 * 用于问答审计、看板统计与链路排错；每次 invoke/stream 成功后写入一条。
 */
export interface QueryLogRow {
  /** 查询日志主键（UUID） */
  id: string;
  /** 会话 ID，用于串联多轮对话；匿名单次问答可为 null */
  session_id: string | null;
  /** 用户原始问题 */
  user_question: string;
  /** 系统最终回答；流式失败等场景可能为 null */
  answer: string | null;
  /**
   * 命中的处理链路标签，例如：
   * - rag / agent_rag：知识库 Agent 问答
   * - sql / web：预留扩展
   */
  route: string;
  /** 本次处理耗时，单位毫秒 */
  latency_ms: number | null;
  /**
   * 回答引用到的 chunk 摘要列表（JSONB 数组）。
   * 元素通常含 ref_id、chunk_id、filename、score、content 等溯源字段。
   */
  source_chunks: unknown[];
  /** 创建时间（带时区） */
  created_at: Date;
  /** 最后更新时间（带时区） */
  updated_at: Date;
}

/** 创建 query_log 表的 DDL（幂等）。 */
export const CREATE_QUERY_LOG_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS query_log (
  id VARCHAR(36) PRIMARY KEY,                          -- 日志主键 UUID
  session_id VARCHAR(100),                             -- 会话 ID（多轮串联）
  user_question TEXT NOT NULL,                         -- 用户原始问题
  answer TEXT,                                         -- 系统最终回答
  route VARCHAR(50) NOT NULL DEFAULT 'rag',            -- 处理链路 rag/agent_rag 等
  latency_ms INTEGER,                                  -- 耗时（毫秒）
  source_chunks JSONB NOT NULL DEFAULT '[]'::jsonb,    -- 引用 chunk 摘要列表
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),       -- 创建时间
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()        -- 更新时间
)
`;

/** query_log 表索引 DDL。 */
export const CREATE_QUERY_LOG_INDEXES_SQL = [
  `CREATE INDEX IF NOT EXISTS ix_query_log_session_id ON query_log (session_id)`,
];

/** 将 JSONB / 字符串规范为数组；异常时返回空数组。 */
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

/** 将 pg 行记录映射为 QueryLogRow。 */
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

/** 插入查询日志时的入参。 */
export interface QueryLogInsertInput {
  /** 可选主键；不传则自动生成 UUID */
  id?: string;
  /** 会话 ID，用于多轮串联 */
  session_id?: string | null;
  /** 用户原始问题 */
  user_question: string;
  /** 系统最终回答 */
  answer?: string | null;
  /** 处理链路标签，默认 rag */
  route?: string;
  /** 耗时（毫秒） */
  latency_ms?: number | null;
  /** 引用 chunk 摘要列表，默认 [] */
  source_chunks?: unknown[];
}

/** 写入一条问答日志，默认 route=rag。 */
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

/** 按会话 id 正序列出问答历史（用于多轮上下文）。 */
export async function listQueryLogsBySession(db: Queryable, sessionId: string): Promise<QueryLogRow[]> {
  const result = await db.query(
    'SELECT * FROM query_log WHERE session_id = $1 ORDER BY created_at ASC',
    [sessionId],
  );
  return result.rows.map((row) => mapQueryLog(row as Record<string, unknown>));
}
