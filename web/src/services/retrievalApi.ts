import api from './api'

export interface RetrievalHitItem {
  chunk_id?: string | null
  document_id?: string | null
  file_name?: string | null
  file_type?: string | null
  chunk_index?: number | null
  content: string
  score: number
  vector_score?: number | null
  bm25_score?: number | null
  fused_score?: number | null
  retrieval_source?: string | null
  retrieval_sources?: string[]
  rank_vector?: number | null
  rank_bm25?: number | null
  rank_fused?: number | null
  splitter_name?: string | null
  parser_name?: string | null
  section_type?: string | null
  section_title?: string | null
  page_number?: number | null
  source_path?: string | null
  start_offset?: number | null
  end_offset?: number | null
}

export interface RetrievalSearchResponse {
  items: RetrievalHitItem[]
}

export const retrievalApi = {
  /**
   * 混合检索调试：向量 + BM25 + RRF 融合
   */
  search: async (payload: { query: string; top_k?: number }) => {
    try {
      return await api.post<RetrievalSearchResponse>(
        '/retrieval/search',
        {
          query: payload.query,
          top_k: payload.top_k ?? 5,
        },
        {
          timeout: 60_000,
        },
      )
    } catch (error) {
      console.error('检索失败:', error)
      throw error
    }
  },
}
