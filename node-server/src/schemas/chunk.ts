/**
 * Chunk 相关 Zod Schema。
 *
 * 定义片段列表/详情响应，以及人工编辑请求体。
 */

import { z } from 'zod';

/** Chunk 列表项与详情项。 */
export const chunkItemSchema = z.object({
  /** Chunk 主键 */
  id: z.string(),
  /** 所属文档 ID */
  document_id: z.string(),
  /** 文档内序号（从 0 或按切分顺序） */
  chunk_index: z.number().int(),
  /** 片段正文 */
  content: z.string(),
  /** 结构化元数据（切分器、路径、页码等） */
  metadata_json: z.record(z.unknown()).default({}),
  /** 估算 token 数 */
  token_count: z.number().int(),
  /** 页码（若有） */
  page_number: z.number().int().nullable().optional(),
  /** 原文起始偏移 */
  start_offset: z.number().int().nullable().optional(),
  /** 原文结束偏移 */
  end_offset: z.number().int().nullable().optional(),
  /** Milvus 向量 ID */
  vector_id: z.string().nullable().optional(),
  /** 是否参与检索 */
  enabled: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

/** Chunk 编辑请求体。 */
export const chunkUpdateRequestSchema = z.object({
  /** 更新后的 chunk 文本；null 表示不改 */
  content: z.string().nullable().optional().default(null),
  /** 是否参与检索；null 表示不改 */
  enabled: z.boolean().nullable().optional().default(null),
  /** 需要合并到元数据中的附加字段；null 表示不改 */
  metadata_json: z.record(z.unknown()).nullable().optional().default(null),
});

export type ChunkItem = z.infer<typeof chunkItemSchema>;
export type ChunkUpdateRequest = z.infer<typeof chunkUpdateRequestSchema>;

/**
 * 将数据库行（metadata_json 可能是 JSON 字符串）转为 API 响应项。
 */
export function toChunkItem(chunk: {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  metadata_json?: Record<string, unknown> | string | null;
  token_count: number;
  page_number?: number | null;
  start_offset?: number | null;
  end_offset?: number | null;
  vector_id?: string | null;
  enabled: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}): ChunkItem {
  const metadata =
    typeof chunk.metadata_json === 'string'
      ? (JSON.parse(chunk.metadata_json) as Record<string, unknown>)
      : chunk.metadata_json ?? {};

  return chunkItemSchema.parse({
    id: chunk.id,
    document_id: chunk.document_id,
    chunk_index: chunk.chunk_index,
    content: chunk.content,
    metadata_json: metadata,
    token_count: chunk.token_count,
    page_number: chunk.page_number ?? null,
    start_offset: chunk.start_offset ?? null,
    end_offset: chunk.end_offset ?? null,
    vector_id: chunk.vector_id ?? null,
    enabled: chunk.enabled,
    created_at: chunk.created_at,
    updated_at: chunk.updated_at,
  });
}
