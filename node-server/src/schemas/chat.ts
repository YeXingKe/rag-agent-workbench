import { z } from 'zod';

export const chatRequestSchema = z.object({
  session_id: z.string().min(1),
  message: z.string(),
  top_k: z.number().int().min(1).max(8).default(5),
});

export const sourceChunkItemSchema = z.object({
  ref_id: z.number().int(),
  chunk_id: z.string().nullable().optional().default(null),
  document_id: z.string().nullable().optional().default(null),
  file_name: z.string().nullable().optional().default(null),
  file_type: z.string().nullable().optional().default(null),
  chunk_index: z.number().int().nullable().optional().default(null),
  content: z.string(),
  score: z.number(),
  vector_score: z.number().nullable().optional().default(null),
  bm25_score: z.number().nullable().optional().default(null),
  fused_score: z.number().nullable().optional().default(null),
  retrieval_source: z.string().nullable().optional().default(null),
  retrieval_sources: z.array(z.string()).default([]),
  rank_vector: z.number().int().nullable().optional().default(null),
  rank_bm25: z.number().int().nullable().optional().default(null),
  rank_fused: z.number().int().nullable().optional().default(null),
  splitter_name: z.string().nullable().optional().default(null),
  parser_name: z.string().nullable().optional().default(null),
  section_type: z.string().nullable().optional().default(null),
  section_title: z.string().nullable().optional().default(null),
  page_number: z.number().int().nullable().optional().default(null),
  source_path: z.string().nullable().optional().default(null),
  start_offset: z.number().int().nullable().optional().default(null),
  end_offset: z.number().int().nullable().optional().default(null),
});

export const chatResponseSchema = z.object({
  session_id: z.string(),
  answer: z.string(),
  route: z.string().default('agent_rag'),
  latency_ms: z.number().int(),
  source_chunks: z.array(sourceChunkItemSchema).default([]),
  created_at: z.coerce.date(),
});

export const chatHistoryItemSchema = z.object({
  id: z.string(),
  session_id: z.string().nullable().optional().default(null),
  user_question: z.string(),
  answer: z.string().nullable().optional().default(null),
  route: z.string(),
  latency_ms: z.number().int().nullable().optional().default(null),
  source_chunks: z.array(sourceChunkItemSchema).default([]),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const sessionSummaryItemSchema = z.object({
  session_id: z.string(),
  latest_question: z.string(),
  latest_answer: z.string().nullable().optional().default(null),
  message_count: z.number().int(),
  updated_at: z.coerce.date(),
});

export const sessionClearResponseSchema = z.object({
  session_id: z.string(),
  deleted_query_log_count: z.number().int(),
  cleared_memory: z.boolean(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type SourceChunkItem = z.infer<typeof sourceChunkItemSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type ChatHistoryItem = z.infer<typeof chatHistoryItemSchema>;
export type SessionSummaryItem = z.infer<typeof sessionSummaryItemSchema>;
export type SessionClearResponse = z.infer<typeof sessionClearResponseSchema>;

type SourceChunkInput = Record<string, unknown> & {
  filename?: string | null;
  file_name?: string | null;
};

export function toSourceChunkItem(item: SourceChunkInput): SourceChunkItem {
  return sourceChunkItemSchema.parse({
    ...item,
    file_name: item.file_name ?? item.filename ?? null,
    retrieval_sources: Array.isArray(item.retrieval_sources) ? item.retrieval_sources : [],
  });
}
