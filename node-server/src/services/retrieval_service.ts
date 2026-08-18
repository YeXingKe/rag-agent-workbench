import type { Queryable } from '../core/postgres.js';
import { retrieveChunks } from '../rag/retriever.js';

export class RetrievalService {
  constructor(private readonly db: Queryable) {}

  async search(params: { query: string; topK?: number }): Promise<Record<string, unknown>[]> {
    return retrieveChunks(this.db, { query: params.query, top_k: params.topK ?? 5 });
  }
}
