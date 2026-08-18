/**
 * 检索业务服务。
 *
 * 对 RAG 检索器做薄封装，供 API 层调用；
 * 具体混合检索（向量 + BM25 + 融合）逻辑在 rag/retriever 中实现。
 */

import type { Queryable } from '../core/postgres.js';
import { retrieveChunks } from '../rag/retriever.js';

/** 知识库检索服务：按查询语句返回相关 chunk。 */
export class RetrievalService {
  constructor(private readonly db: Queryable) {}

  /**
   * 执行一次知识库检索。
   * @param params.query 用户查询文本
   * @param params.topK 返回条数上限，默认 5
   */
  async search(params: { query: string; topK?: number }): Promise<Record<string, unknown>[]> {
    return retrieveChunks(this.db, { query: params.query, top_k: params.topK ?? 5 });
  }
}
