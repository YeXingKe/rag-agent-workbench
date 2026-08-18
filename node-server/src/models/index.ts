/**
 * 数据模型聚合入口
 *
 * 重新导出各表 DDL / CRUD，并提供 initTables 一次性建表建索引。
 * 注意：建表顺序需满足外键依赖（document → chunk）。
 */
import type { Queryable } from '../core/postgres.js';
import { getPool } from '../core/postgres.js';
import { CREATE_CHUNK_INDEXES_SQL, CREATE_CHUNK_TABLE_SQL } from './chunk.js';
import { CREATE_DOCUMENT_INDEXES_SQL, CREATE_DOCUMENT_TABLE_SQL } from './document.js';
import { CREATE_QUERY_LOG_INDEXES_SQL, CREATE_QUERY_LOG_TABLE_SQL } from './queryLog.js';

export { CREATE_CHUNK_INDEXES_SQL, CREATE_CHUNK_TABLE_SQL, insertChunk, insertChunks, listEnabledChunks, mapChunk } from './chunk.js';
export type { ChunkInsertInput, ChunkRow } from './chunk.js';

export { CREATE_DOCUMENT_INDEXES_SQL, CREATE_DOCUMENT_TABLE_SQL, insertDocument, updateDocument, saveDocument } from './document.js';
export type { DocumentInsertInput, DocumentRow } from './document.js';

export { CREATE_QUERY_LOG_INDEXES_SQL, CREATE_QUERY_LOG_TABLE_SQL, insertQueryLog } from './queryLog.js';
export type { QueryLogInsertInput, QueryLogRow } from './queryLog.js';

/**
 * 初始化全部业务表与索引（幂等，CREATE IF NOT EXISTS）。
 *
 * @param db 默认为连接池；也可传入事务 client
 */
export async function initTables(db: Queryable = getPool()): Promise<void> {
  await db.query(CREATE_DOCUMENT_TABLE_SQL);
  for (const sql of CREATE_DOCUMENT_INDEXES_SQL) {
    await db.query(sql);
  }
  await db.query(CREATE_CHUNK_TABLE_SQL);
  for (const sql of CREATE_CHUNK_INDEXES_SQL) {
    await db.query(sql);
  }
  await db.query(CREATE_QUERY_LOG_TABLE_SQL);
  for (const sql of CREATE_QUERY_LOG_INDEXES_SQL) {
    await db.query(sql);
  }
}
