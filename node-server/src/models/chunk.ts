/**
 * Chunk 表模型与 CRUD
 *
 * 存储文档切分后的文本块、元数据，以及与 Milvus 向量 id 的关联。
 */
import { randomUUID } from 'node:crypto';

import type { Queryable } from '../core/postgres.js';

/**
 * chunk 表一行的 TypeScript 映射。
 *
 * 支撑切分可视化与答案溯源：
 * - content：切分正文
 * - metadata_json：页码、标题、切分策略等扩展信息
 * - vector_id：向量库主键，便于反查与重建索引
 */
export interface ChunkRow {
  /** Chunk 主键（UUID），便于跨表引用与溯源编号 */
  id: string;
  /** 所属文档 ID（外键 document.id，级联删除） */
  document_id: string;
  /** 在同一文档中的顺序编号，从 0 开始 */
  chunk_index: number;
  /** 切分后的正文内容 */
  content: string;
  /**
   * 扩展元数据（JSONB），常见键包括：
   * filename / file_type / parser_name / splitter_name /
   * section_type / section_title / page_number / source_path /
   * knowledge_base / chunk_id / vector_id / manual_edited 等
   */
  metadata_json: Record<string, unknown>;
  /** 预估 token 数量（当前实现多为 len/4 近似） */
  token_count: number;
  /** 来源页码，适用于 PDF 等分页文档；无页码时为 null */
  page_number: number | null;
  /** 在原文（或 section）中的起始字符偏移 */
  start_offset: number | null;
  /** 在原文（或 section）中的结束字符偏移 */
  end_offset: number | null;
  /** Milvus 中对应向量记录 ID；尚未向量化时为 null */
  vector_id: string | null;
  /** 是否参与检索；false 可人工排除脏数据且不删库 */
  enabled: boolean;
  /** 创建时间（带时区） */
  created_at: Date;
  /** 最后更新时间（带时区） */
  updated_at: Date;
}

/**
 * 创建 chunk 表的 DDL（幂等）。
 * document_id 外键级联删除：删文档时自动清理分块。
 */
export const CREATE_CHUNK_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS chunk (
  id VARCHAR(36) PRIMARY KEY,                                      -- Chunk 主键 UUID
  document_id VARCHAR(36) NOT NULL REFERENCES document(id) ON DELETE CASCADE, -- 所属文档 ID
  chunk_index INTEGER NOT NULL,                                    -- 文档内顺序号
  content TEXT NOT NULL,                                           -- 切分正文
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,                -- 扩展元数据
  token_count INTEGER NOT NULL DEFAULT 0,                          -- 预估 token 数
  page_number INTEGER,                                             -- 来源页码
  start_offset INTEGER,                                            -- 原文起始偏移
  end_offset INTEGER,                                              -- 原文结束偏移
  vector_id VARCHAR(128),                                          -- Milvus 向量 ID
  enabled BOOLEAN NOT NULL DEFAULT TRUE,                           -- 是否参与检索
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),                   -- 创建时间
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()                    -- 更新时间
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
  /** 可选主键；不传则自动生成 UUID */
  id?: string;
  /** 所属文档 ID */
  document_id: string;
  /** 文档内顺序编号（从 0 起） */
  chunk_index: number;
  /** 切分正文 */
  content: string;
  /** 扩展元数据，默认 {} */
  metadata_json?: Record<string, unknown>;
  /** 预估 token 数，默认 0 */
  token_count?: number;
  /** 来源页码 */
  page_number?: number | null;
  /** 原文起始偏移 */
  start_offset?: number | null;
  /** 原文结束偏移 */
  end_offset?: number | null;
  /** Milvus 向量 ID；入库前通常为空 */
  vector_id?: string | null;
  /** 是否参与检索，默认 true */
  enabled?: boolean;
}

/** 递归去掉字符串中的 NUL，避免 jsonb/text 写入 PG 时报 UTF8 0x00 错误。 */
function stripNullBytes(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\u0000/g, '');
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripNullBytes(item));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key.replace(/\u0000/g, '')] = stripNullBytes(item);
    }
    return result;
  }
  return value;
}

/** 插入单条 chunk；metadata 以 JSON 字符串写入 jsonb。 */
export async function insertChunk(db: Queryable, input: ChunkInsertInput): Promise<ChunkRow> {
  const id = input.id ?? randomUUID();
  // PDF 等解析可能残留 0x00，入库前强制剔除
  const safeContent = String(input.content ?? '').replace(/\u0000/g, '');
  const safeMetadata = stripNullBytes(input.metadata_json ?? {}) as Record<string, unknown>;
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
      safeContent,
      JSON.stringify(safeMetadata),
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
