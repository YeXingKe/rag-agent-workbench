/**
 * 检索相关 Zod Schema。
 *
 * 对应调试检索接口的请求体与命中结果结构，字段语义与 Python 端保持一致。
 */

import { z } from 'zod';

/** 检索请求体。 */
export const retrievalSearchRequestSchema = z.object({
  /** 用户查询文本 */
  query: z.string(),
  /** 返回条数上限，默认 5，范围 1~20 */
  top_k: z.number().int().min(1).max(20).default(5),
});

/** 单条检索命中结果。 */
export const retrievalHitItemSchema = z.object({
  /** Chunk 唯一 ID */
  chunk_id: z.string().nullable().optional().default(null),
  /** 所属文档 ID */
  document_id: z.string().nullable().optional().default(null),
  /** 源文件名 */
  file_name: z.string().nullable().optional().default(null),
  /** 文件类型，如 pdf / md */
  file_type: z.string().nullable().optional().default(null),
  /** 在文档内的 chunk 序号 */
  chunk_index: z.number().int().nullable().optional().default(null),
  /** 命中文本内容 */
  content: z.string(),
  /** 综合相关性分数 */
  score: z.number(),
  /** 向量检索分数 */
  vector_score: z.number().nullable().optional().default(null),
  /** BM25 检索分数 */
  bm25_score: z.number().nullable().optional().default(null),
  /** 融合后分数 */
  fused_score: z.number().nullable().optional().default(null),
  /** 主检索来源标签（如 vector / bm25 / fused） */
  retrieval_source: z.string().nullable().optional().default(null),
  /** 参与命中的全部来源标签列表 */
  retrieval_sources: z.array(z.string()).default([]),
  /** 向量通道排名 */
  rank_vector: z.number().int().nullable().optional().default(null),
  /** BM25 通道排名 */
  rank_bm25: z.number().int().nullable().optional().default(null),
  /** 融合后排名 */
  rank_fused: z.number().int().nullable().optional().default(null),
  /** 切分器名称 */
  splitter_name: z.string().nullable().optional().default(null),
  /** 解析器名称 */
  parser_name: z.string().nullable().optional().default(null),
  /** 章节类型 */
  section_type: z.string().nullable().optional().default(null),
  /** 章节标题 */
  section_title: z.string().nullable().optional().default(null),
  /** 页码（若有） */
  page_number: z.number().int().nullable().optional().default(null),
  /** 源文件路径 */
  source_path: z.string().nullable().optional().default(null),
  /** 原文起始偏移 */
  start_offset: z.number().int().nullable().optional().default(null),
  /** 原文结束偏移 */
  end_offset: z.number().int().nullable().optional().default(null),
});

/** 检索响应体。 */
export const retrievalSearchResponseSchema = z.object({
  /** 命中列表 */
  items: z.array(retrievalHitItemSchema).default([]),
});

export type RetrievalSearchRequest = z.infer<typeof retrievalSearchRequestSchema>;
export type RetrievalHitItem = z.infer<typeof retrievalHitItemSchema>;
export type RetrievalSearchResponse = z.infer<typeof retrievalSearchResponseSchema>;

type RetrievalHitInput = Record<string, unknown> & {
  filename?: string | null;
  file_name?: string | null;
};

/**
 * 将内部检索 hit（可能含 filename）规范化为 API 响应项（统一 file_name）。
 */
export function toRetrievalHitItem(hit: RetrievalHitInput): RetrievalHitItem {
  return retrievalHitItemSchema.parse({
    ...hit,
    file_name: hit.file_name ?? hit.filename ?? null,
    retrieval_sources: Array.isArray(hit.retrieval_sources) ? hit.retrieval_sources : [],
  });
}
