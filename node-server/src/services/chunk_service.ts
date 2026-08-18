import { addTexts, deleteByIds } from '../core/milvus.js';
import type { Queryable } from '../core/postgres.js';
import { getChunkById, mapChunk, type ChunkRow } from '../models/chunk.js';
import { getBm25Index } from '../rag/bm25_index.js';
import { cleanText, estimateTokenCount } from '../utils/text.js';

export class ChunkService {
  constructor(private readonly db: Queryable) {}

  async listChunks(params: { documentId?: string | null; limit?: number } = {}): Promise<ChunkRow[]> {
    const limit = params.limit ?? 100;
    if (params.documentId) {
      const result = await this.db.query(
        'SELECT * FROM chunk WHERE document_id = $1 ORDER BY updated_at DESC LIMIT $2',
        [params.documentId, limit],
      );
      return result.rows.map((row) => mapChunk(row as Record<string, unknown>));
    }
    const result = await this.db.query('SELECT * FROM chunk ORDER BY updated_at DESC LIMIT $1', [limit]);
    return result.rows.map((row) => mapChunk(row as Record<string, unknown>));
  }

  async getChunk(chunkId: string): Promise<ChunkRow | null> {
    return getChunkById(this.db, chunkId);
  }

  async updateChunk(
    chunkId: string,
    params: {
      content?: string | null;
      enabled?: boolean | null;
      metadataJson?: Record<string, unknown> | null;
    },
  ): Promise<ChunkRow | null> {
    const chunk = await this.getChunk(chunkId);
    if (chunk == null) {
      return null;
    }

    let metadata = { ...chunk.metadata_json };
    let metadataChanged = false;
    if (params.metadataJson) {
      metadata = { ...metadata, ...params.metadataJson };
      metadataChanged = true;
    }

    let enabled = chunk.enabled;
    if (params.enabled != null) {
      enabled = params.enabled;
    }

    let content = chunk.content;
    let tokenCount = chunk.token_count;
    let vectorId = chunk.vector_id;

    if (params.content != null) {
      const normalizedContent = cleanText(params.content);
      if (!normalizedContent) {
        throw new Error('Chunk content cannot be empty');
      }

      if (normalizedContent !== chunk.content) {
        if (chunk.vector_id) {
          try {
            await deleteByIds([chunk.vector_id]);
          } catch {
            // 向量删除失败不阻止文本更新，后续可通过重建索引重新清理。
          }
        }

        content = normalizedContent;
        tokenCount = estimateTokenCount(normalizedContent);
        const updatedMetadata = {
          ...metadata,
          chunk_id: chunk.id,
          chunk_index: chunk.chunk_index,
          document_id: chunk.document_id,
          start_offset: chunk.start_offset,
          end_offset: chunk.end_offset,
          manual_edited: true,
        };
        const vectorIds = await addTexts([content], [updatedMetadata]);
        vectorId = String(vectorIds[0]);
        metadata = {
          ...updatedMetadata,
          vector_id: vectorId,
        };
      } else if (metadataChanged) {
        metadata = {
          ...metadata,
          manual_edited: true,
        };
      }
    }

    const result = await this.db.query(
      `UPDATE chunk
       SET content = $2,
           enabled = $3,
           metadata_json = $4::jsonb,
           token_count = $5,
           vector_id = $6,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [chunkId, content, enabled, JSON.stringify(metadata), tokenCount, vectorId],
    );

    getBm25Index().markDirty(`chunk_updated:${chunkId}`);
    return result.rows[0] ? mapChunk(result.rows[0] as Record<string, unknown>) : null;
  }

  async deleteChunk(chunkId: string): Promise<boolean> {
    const chunk = await this.getChunk(chunkId);
    if (chunk == null) {
      return false;
    }

    if (chunk.vector_id) {
      try {
        await deleteByIds([chunk.vector_id]);
      } catch {
        // 即使向量删除失败，也继续删除数据库记录，防止产生脏数据死锁。
      }
    }

    await this.db.query('DELETE FROM chunk WHERE id = $1', [chunkId]);
    getBm25Index().markDirty(`chunk_deleted:${chunkId}`);
    return true;
  }
}
