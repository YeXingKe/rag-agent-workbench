/**
 * Chunk 表模型与 CRUD
 *
 * 存储文档切分后的文本块、元数据，以及与 Milvus 向量 id 的关联。
 */
import { randomUUID } from 'node:crypto';

import type { Queryable } from '../core/postgres.js';

/** chunk 表一行的 TypeScript 映射。 */
export interface ChunkRow {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  metadata_json: Record<string, unknown>;
  token_count: number;
  page_number: number | null;
  start_offset: number | null;
  end_offset: number | null;
  /** 对应 Milvus 主键；未入库时为 null。 */
  vector_id: string | null;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * 创建 chunk 表的 DDL（幂等）。
 * document_id 外键级联删除：删文档时自动清理分块。
 */
export const CREATE_CHUNK_TABLE_SQL = `
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
)
`;

/** chunk 表索引 DDL（文档、向量 id、启用状态）。 */
export const CREATE_CHUNK_INDEXES_SQL = [
  `CREATE INDEX IF NOT EXISTS ix_chunk_document_id ON chunk (document_id)`,
  `CREATE INDEX IF NOT EXISTS ix_chunk_vector_id ON chunk (vector_id)`,
  `CREATE INDEX IF NOT EXISTS ix_chunk_enabled ON chunk (enabled)`,
];

/**
 * 将 JSONB / 字符串 / 异常值规范为普通对象。
 * 解析失败时返回空对象，避免上层崩溃。
 */
function asMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

/** 将 pg 行记录映射为 ChunkRow。 */
export function mapChunk(row: Record<string, unknown>): ChunkRow {
  return {
    id: String(row.id),
    document_id: String(row.document_id),
    chunk_index: Number(row.chunk_index),
    content: String(row.content),
    metadata_json: asMetadata(row.metadata_json),
    token_count: Number(row.token_count ?? 0),
    page_number: row.page_number == null ? null : Number(row.page_number),
    start_offset: row.start_offset == null ? null : Number(row.start_offset),
    end_offset: row.end_offset == null ? null : Number(row.end_offset),
    vector_id: row.vector_id == null ? null : String(row.vector_id),
    enabled: Boolean(row.enabled),
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

/** 插入分块时的入参；缺省 id 时自动生成 UUID。 */
export interface ChunkInsertInput {
  id?: string;
  document_id: string;
  chunk_index: number;
  content: string;
  metadata_json?: Record<string, unknown>;
  token_count?: number;
  page_number?: number | null;
  start_offset?: number | null;
  end_offset?: number | null;
  vector_id?: string | null;
  enabled?: boolean;
}

/** 插入单条 chunk；metadata 以 JSON 字符串写入 jsonb。 */
export async function insertChunk(db: Queryable, input: ChunkInsertInput): Promise<ChunkRow> {
  const id = input.id ?? randomUUID();
  const result = await db.query(
    `
    INSERT INTO chunk (
      id, document_id, chunk_index, content, metadata_json, token_count,
      page_number, start_offset, end_offset, vector_id, enabled
    ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11)
    RETURNING *
    `,
    [
      id,
      input.document_id,
      input.chunk_index,
      input.content,
      JSON.stringify(input.metadata_json ?? {}),
      input.token_count ?? 0,
      input.page_number ?? null,
      input.start_offset ?? null,
      input.end_offset ?? null,
      input.vector_id ?? null,
      input.enabled ?? true,
    ],
  );
  return mapChunk(result.rows[0] as Record<string, unknown>);
}

/** 顺序批量插入分块（同一事务时由调用方 withSession 包裹）。 */
export async function insertChunks(db: Queryable, inputs: ChunkInsertInput[]): Promise<ChunkRow[]> {
  const rows: ChunkRow[] = [];
  for (const input of inputs) {
    rows.push(await insertChunk(db, input));
  }
  return rows;
}

/** 向量入库成功后回写 vector_id 与 metadata。 */
export async function updateChunkVector(db: Queryable, id: string, vectorId: string, metadataJson: Record<string, unknown>): Promise<void> {
  await db.query(
    `
    UPDATE chunk
    SET vector_id = $2, metadata_json = $3::jsonb, updated_at = NOW()
    WHERE id = $1
    `,
    [id, vectorId, JSON.stringify(metadataJson)],
  );
}

/** 列出所有启用中的分块（用于重建 BM25 等索引）。 */
export async function listEnabledChunks(db: Queryable): Promise<ChunkRow[]> {
  const result = await db.query('SELECT * FROM chunk WHERE enabled = TRUE ORDER BY updated_at DESC');
  return result.rows.map((row) => mapChunk(row as Record<string, unknown>));
}

/** 按文档 id 列出分块，顺序与切分时 chunk_index 一致。 */
export async function listChunksByDocumentId(db: Queryable, documentId: string): Promise<ChunkRow[]> {
  const result = await db.query(
    'SELECT * FROM chunk WHERE document_id = $1 ORDER BY chunk_index ASC',
    [documentId],
  );
  return result.rows.map((row) => mapChunk(row as Record<string, unknown>));
}

/**
 * 删除某文档下全部 chunk。
 * @returns 删除行数
 */
export async function deleteChunksByDocumentId(db: Queryable, documentId: string): Promise<number> {
  const result = await db.query('DELETE FROM chunk WHERE document_id = $1', [documentId]);
  return result.rowCount ?? 0;
}

/**
 * 对启用分块做 ILIKE 模糊检索（关键词兜底通道）。
 * @param query 不含通配符的关键词，内部会包上 %...%
 */
export async function searchChunksIlike(db: Queryable, query: string, topK: number): Promise<ChunkRow[]> {
  const result = await db.query(
    `
    SELECT * FROM chunk
    WHERE enabled = TRUE AND content ILIKE $1
    ORDER BY updated_at DESC
    LIMIT $2
    `,
    [`%${query}%`, topK],
  );
  return result.rows.map((row) => mapChunk(row as Record<string, unknown>));
}

/** 按 id 查询分块；不存在返回 null。 */
export async function getChunkById(db: Queryable, id: string): Promise<ChunkRow | null> {
  const result = await db.query('SELECT * FROM chunk WHERE id = $1', [id]);
  if (!result.rows[0]) {
    return null;
  }
  return mapChunk(result.rows[0] as Record<string, unknown>);
}
