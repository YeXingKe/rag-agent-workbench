/**
 * 文档相关 Zod Schema。
 *
 * 覆盖文本入库、上传响应、重建索引请求，以及切分策略选项。
 */

import { z } from 'zod';

/** 通过纯文本快速入库的请求体。 */
export const documentCreateRequestSchema = z.object({
  /** 文档文件名，仅用于展示与类型推断 */
  filename: z.string().min(1),
  /** 文档正文内容 */
  content: z.string(),
  /** 目标知识库名称 */
  knowledge_base: z.string().default('default'),
  /** 可选切分策略：structured / semi_structured / unstructured */
  preferred_splitter: z.string().nullable().optional().default(null),
});

/** 文档重建索引请求体。 */
export const documentRebuildRequestSchema = z.object({
  /** 强制指定切分策略，不传则自动判断 */
  preferred_splitter: z.string().nullable().optional().default(null),
});

/** 文档列表项 / 详情项。 */
export const documentItemSchema = z.object({
  /** 文档主键 */
  id: z.string(),
  /** 所属知识库 */
  knowledge_base: z.string(),
  /** 文件名 */
  filename: z.string(),
  /** 文件类型 */
  file_type: z.string(),
  /** 本地源文件路径（上传场景） */
  source_path: z.string().nullable().optional(),
  /** 文件字节大小 */
  file_size: z.number().int().nullable().optional(),
  /** 入库状态，如 pending / ready / failed */
  status: z.string(),
  /** 切分得到的 chunk 数量 */
  chunk_count: z.number().int(),
  /** 文档摘要（若有） */
  summary: z.string().nullable().optional(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

/** 文档入库响应。 */
export const documentIngestResponseSchema = z.object({
  document: documentItemSchema,
  message: z.string().default('Document ingested successfully'),
});

/** 文件上传并入库响应。 */
export const documentUploadResponseSchema = z.object({
  document: documentItemSchema,
  message: z.string().default('Document uploaded and ingested successfully'),
});

/** 切分策略选项。 */
export const splitterOptionItemSchema = z.object({
  /** 策略注册名 */
  name: z.string(),
  /** 中文适用场景说明 */
  description: z.string(),
});

export type DocumentCreateRequest = z.infer<typeof documentCreateRequestSchema>;
export type DocumentRebuildRequest = z.infer<typeof documentRebuildRequestSchema>;
export type DocumentItem = z.infer<typeof documentItemSchema>;
export type DocumentIngestResponse = z.infer<typeof documentIngestResponseSchema>;
export type DocumentUploadResponse = z.infer<typeof documentUploadResponseSchema>;
export type SplitterOptionItem = z.infer<typeof splitterOptionItemSchema>;

/**
 * 将数据库文档行规范化为 API 响应项（file_size 转 number 等）。
 */
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
