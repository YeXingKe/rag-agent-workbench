import { z } from 'zod';

export const retrievalSearchRequestSchema = z.object({
  query: z.string(),
  top_k: z.number().int().min(1).max(20).default(5),
});

export const retrievalHitItemSchema = z.object({
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

export const retrievalSearchResponseSchema = z.object({
  items: z.array(retrievalHitItemSchema).default([]),
});

export type RetrievalSearchRequest = z.infer<typeof retrievalSearchRequestSchema>;
export type RetrievalHitItem = z.infer<typeof retrievalHitItemSchema>;
export type RetrievalSearchResponse = z.infer<typeof retrievalSearchResponseSchema>;

type RetrievalHitInput = Record<string, unknown> & {
  filename?: string | null;
  file_name?: string | null;
};

export function toRetrievalHitItem(hit: RetrievalHitInput): RetrievalHitItem {
  return retrievalHitItemSchema.parse({
    ...hit,
    file_name: hit.file_name ?? hit.filename ?? null,
    retrieval_sources: Array.isArray(hit.retrieval_sources) ? hit.retrieval_sources : [],
  });
}
