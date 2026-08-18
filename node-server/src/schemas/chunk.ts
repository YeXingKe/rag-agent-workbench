import { z } from 'zod';

export const chunkItemSchema = z.object({
  id: z.string(),
  document_id: z.string(),
  chunk_index: z.number().int(),
  content: z.string(),
  metadata_json: z.record(z.unknown()).default({}),
  token_count: z.number().int(),
  page_number: z.number().int().nullable().optional(),
  start_offset: z.number().int().nullable().optional(),
  end_offset: z.number().int().nullable().optional(),
  vector_id: z.string().nullable().optional(),
  enabled: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const chunkUpdateRequestSchema = z.object({
  content: z.string().nullable().optional().default(null),
  enabled: z.boolean().nullable().optional().default(null),
  metadata_json: z.record(z.unknown()).nullable().optional().default(null),
});

export type ChunkItem = z.infer<typeof chunkItemSchema>;
export type ChunkUpdateRequest = z.infer<typeof chunkUpdateRequestSchema>;

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
