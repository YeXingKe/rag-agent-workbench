import { z } from 'zod';

export const documentCreateRequestSchema = z.object({
  filename: z.string().min(1),
  content: z.string(),
  knowledge_base: z.string().default('default'),
  preferred_splitter: z.string().nullable().optional().default(null),
});

export const documentRebuildRequestSchema = z.object({
  preferred_splitter: z.string().nullable().optional().default(null),
});

export const documentItemSchema = z.object({
  id: z.string(),
  knowledge_base: z.string(),
  filename: z.string(),
  file_type: z.string(),
  source_path: z.string().nullable().optional(),
  file_size: z.number().int().nullable().optional(),
  status: z.string(),
  chunk_count: z.number().int(),
  summary: z.string().nullable().optional(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const documentIngestResponseSchema = z.object({
  document: documentItemSchema,
  message: z.string().default('Document ingested successfully'),
});

export const documentUploadResponseSchema = z.object({
  document: documentItemSchema,
  message: z.string().default('Document uploaded and ingested successfully'),
});

export const splitterOptionItemSchema = z.object({
  name: z.string(),
  description: z.string(),
});

export type DocumentCreateRequest = z.infer<typeof documentCreateRequestSchema>;
export type DocumentRebuildRequest = z.infer<typeof documentRebuildRequestSchema>;
export type DocumentItem = z.infer<typeof documentItemSchema>;
export type DocumentIngestResponse = z.infer<typeof documentIngestResponseSchema>;
export type DocumentUploadResponse = z.infer<typeof documentUploadResponseSchema>;
export type SplitterOptionItem = z.infer<typeof splitterOptionItemSchema>;

export function toDocumentItem(document: {
  id: string;
  knowledge_base: string;
  filename: string;
  file_type: string;
  source_path?: string | null;
  file_size?: number | string | null;
  status: string;
  chunk_count: number;
  summary?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}): DocumentItem {
  return documentItemSchema.parse({
    id: document.id,
    knowledge_base: document.knowledge_base,
    filename: document.filename,
    file_type: document.file_type,
    source_path: document.source_path ?? null,
    file_size: document.file_size == null ? null : Number(document.file_size),
    status: document.status,
    chunk_count: document.chunk_count,
    summary: document.summary ?? null,
    created_at: document.created_at,
    updated_at: document.updated_at,
  });
}
