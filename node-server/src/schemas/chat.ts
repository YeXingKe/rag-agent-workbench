/**
 * 对话相关 Zod Schema。
 *
 * 定义聊天请求/响应、溯源片段、会话历史与清空结果等结构，
 * 字段命名与 Python 服务端对齐，便于前后端共用。
 */

import { z } from 'zod';

/** 聊天请求体。 */
export const chatRequestSchema = z.object({
  /** 会话 ID，用作多轮记忆的 thread_id */
  session_id: z.string().min(1),
  /** 用户问题 */
  message: z.string(),
  /** 知识库检索结果数量上限，默认 5，范围 1~8 */
  top_k: z.number().int().min(1).max(8).default(5),
});

/** 答案溯源条目（对应 Agent/预检索命中的 chunk）。 */
export const sourceChunkItemSchema = z.object({
  /** 引用编号，对应回答中的 [1]、[2] */
  ref_id: z.number().int(),
  /** Chunk ID */
  chunk_id: z.string().nullable().optional().default(null),
  /** 文档 ID */
  document_id: z.string().nullable().optional().default(null),
  /** 源文件名 */
  file_name: z.string().nullable().optional().default(null),
  /** 文件类型 */
  file_type: z.string().nullable().optional().default(null),
  /** 文档内 chunk 序号 */
  chunk_index: z.number().int().nullable().optional().default(null),
  /** 片段正文 */
  content: z.string(),
  /** 综合相关性分数 */
  score: z.number(),
  /** 向量分数 */
  vector_score: z.number().nullable().optional().default(null),
  /** BM25 分数 */
  bm25_score: z.number().nullable().optional().default(null),
  /** 融合分数 */
  fused_score: z.number().nullable().optional().default(null),
  /** 主检索来源 */
  retrieval_source: z.string().nullable().optional().default(null),
  /** 全部检索来源标签 */
  retrieval_sources: z.array(z.string()).default([]),
  /** 向量通道排名 */
  rank_vector: z.number().int().nullable().optional().default(null),
  /** BM25 通道排名 */
  rank_bm25: z.number().int().nullable().optional().default(null),
  /** 融合排名 */
  rank_fused: z.number().int().nullable().optional().default(null),
  /** 切分器名称 */
  splitter_name: z.string().nullable().optional().default(null),
  /** 解析器名称 */
  parser_name: z.string().nullable().optional().default(null),
  /** 章节类型 */
  section_type: z.string().nullable().optional().default(null),
  /** 章节标题 */
  section_title: z.string().nullable().optional().default(null),
  /** 页码 */
  page_number: z.number().int().nullable().optional().default(null),
  /** 源路径 */
  source_path: z.string().nullable().optional().default(null),
  /** 起始偏移 */
  start_offset: z.number().int().nullable().optional().default(null),
  /** 结束偏移 */
  end_offset: z.number().int().nullable().optional().default(null),
});

/** 同步聊天响应。 */
export const chatResponseSchema = z.object({
  session_id: z.string(),
  /** 最终回答文本 */
  answer: z.string(),
  /** 处理路径，默认 agent_rag */
  route: z.string().default('agent_rag'),
  /** 端到端耗时（毫秒） */
  latency_ms: z.number().int(),
  /** 溯源片段列表 */
  source_chunks: z.array(sourceChunkItemSchema).default([]),
  created_at: z.coerce.date(),
});

/** 单轮会话历史记录（对应 query_log 一行）。 */
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

/** 会话摘要（会话列表用）。 */
export const sessionSummaryItemSchema = z.object({
  session_id: z.string(),
  /** 最近一条用户问题 */
  latest_question: z.string(),
  /** 最近一条回答 */
  latest_answer: z.string().nullable().optional().default(null),
  /** 该会话消息条数 */
  message_count: z.number().int(),
  updated_at: z.coerce.date(),
});

/** 清空会话响应。 */
export const sessionClearResponseSchema = z.object({
  session_id: z.string(),
  /** 删除的 query_log 行数 */
  deleted_query_log_count: z.number().int(),
  /** 是否成功清理短期记忆 checkpointer */
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

/**
 * 将内部来源片段（可能含 filename）规范化为 API 溯源项（统一 file_name）。
 */
export function toSourceChunkItem(item: SourceChunkInput): SourceChunkItem {
  return sourceChunkItemSchema.parse({
    ...item,
    file_name: item.file_name ?? item.filename ?? null,
    retrieval_sources: Array.isArray(item.retrieval_sources) ? item.retrieval_sources : [],
  });
}
