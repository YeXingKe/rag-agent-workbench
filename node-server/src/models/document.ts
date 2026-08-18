/**
 * Document 表模型与 CRUD
 *
 * 对应知识库中的源文档元数据（文件名、状态、分块数等）。
 */
import { randomUUID } from 'node:crypto';

import type { Queryable } from '../core/postgres.js';

/** document 表一行的 TypeScript 映射。 */
export interface DocumentRow {
  id: string;
  knowledge_base: string;
  filename: string;
  file_type: string;
  source_path: string | null;
  file_size: number | null;
  status: string;
  chunk_count: number;
  summary: string | null;
  created_at: Date;
  updated_at: Date;
}

/** 创建 document 表的 DDL（幂等）。 */
export const CREATE_DOCUMENT_TABLE_SQL = `
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
)
`;

/** document 表索引 DDL。 */
export const CREATE_DOCUMENT_INDEXES_SQL = [
  `CREATE INDEX IF NOT EXISTS ix_document_knowledge_base ON document (knowledge_base)`,
];

/** 将 pg 行记录映射为 DocumentRow。 */
function mapDocument(row: Record<string, unknown>): DocumentRow {
  return {
    id: String(row.id),
    knowledge_base: String(row.knowledge_base),
    filename: String(row.filename),
    file_type: String(row.file_type),
    source_path: row.source_path == null ? null : String(row.source_path),
    file_size: row.file_size == null ? null : Number(row.file_size),
    status: String(row.status),
    chunk_count: Number(row.chunk_count ?? 0),
    summary: row.summary == null ? null : String(row.summary),
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

/** 插入文档时的入参；缺省 id 时自动生成 UUID。 */
export interface DocumentInsertInput {
  id?: string;
  knowledge_base: string;
  filename: string;
  file_type: string;
  source_path?: string | null;
  file_size?: number | null;
  status?: string;
  chunk_count?: number;
  summary?: string | null;
}

/** 插入一条文档记录，默认 status=uploaded。 */
export async function insertDocument(db: Queryable, input: DocumentInsertInput): Promise<DocumentRow> {
  const id = input.id ?? randomUUID();
  const result = await db.query(
    `
    INSERT INTO document (
      id, knowledge_base, filename, file_type, source_path, file_size, status, chunk_count, summary
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
    `,
    [
      id,
      input.knowledge_base,
      input.filename,
      input.file_type,
      input.source_path ?? null,
      input.file_size ?? null,
      input.status ?? 'uploaded',
      input.chunk_count ?? 0,
      input.summary ?? null,
    ],
  );
  return mapDocument(result.rows[0] as Record<string, unknown>);
}

/** 按主键全量更新文档字段，并刷新 updated_at。 */
export async function saveDocument(db: Queryable, document: DocumentRow): Promise<DocumentRow> {
  const result = await db.query(
    `
    UPDATE document SET
      knowledge_base = $2,
      filename = $3,
      file_type = $4,
      source_path = $5,
      file_size = $6,
      status = $7,
      chunk_count = $8,
      summary = $9,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [
      document.id,
      document.knowledge_base,
      document.filename,
      document.file_type,
      document.source_path,
      document.file_size,
      document.status,
      document.chunk_count,
      document.summary,
    ],
  );
  if (!result.rows[0]) {
    throw new Error(`Document not found: ${document.id}`);
  }
  return mapDocument(result.rows[0] as Record<string, unknown>);
}

/**
 * 部分更新：先读再合并 patch 后 save。
 * 保留原 id / created_at。
 */
export async function updateDocument(
  db: Queryable,
  id: string,
  patch: Partial<Omit<DocumentRow, 'id' | 'created_at'>>,
): Promise<DocumentRow> {
  const current = await getDocumentById(db, id);
  if (!current) {
    throw new Error(`Document not found: ${id}`);
  }
  return saveDocument(db, { ...current, ...patch, id: current.id, created_at: current.created_at });
}

/** 按 id 查询文档；不存在返回 null。 */
export async function getDocumentById(db: Queryable, id: string): Promise<DocumentRow | null> {
  const result = await db.query('SELECT * FROM document WHERE id = $1', [id]);
  if (!result.rows[0]) {
    return null;
  }
  return mapDocument(result.rows[0] as Record<string, unknown>);
}

/** 按 updated_at 倒序列出全部文档。 */
export async function listDocuments(db: Queryable): Promise<DocumentRow[]> {
  const result = await db.query('SELECT * FROM document ORDER BY updated_at DESC');
  return result.rows.map((row) => mapDocument(row as Record<string, unknown>));
}

/**
 * 按 id 删除文档。
 * @returns 是否实际删除到行
 */
export async function deleteDocumentById(db: Queryable, id: string): Promise<boolean> {
  const result = await db.query('DELETE FROM document WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}
