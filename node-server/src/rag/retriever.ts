import type { Queryable } from '../core/postgres.js';
import { getVectorStore } from '../core/milvus.js';
import { searchChunksIlike } from '../models/chunk.js';
import { getBm25Index, type Bm25Record } from './bm25_index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('rag.retriever');

const RRF_K = 60;
const CANDIDATE_MULTIPLIER = 4;
const MIN_CANDIDATE_K = 10;

export type RetrievalHit = Record<string, unknown> & {
  chunk_id?: unknown;
  document_id?: unknown;
  filename?: unknown;
  file_type?: unknown;
  chunk_index?: unknown;
  content?: unknown;
  score?: number;
  vector_score?: number | null;
  bm25_score?: number | null;
  fused_score?: number;
  retrieval_source?: string;
  retrieval_sources?: string[];
  rank_vector?: number | null;
  rank_bm25?: number | null;
  rank_fused?: number | null;
  splitter_name?: unknown;
  parser_name?: unknown;
  section_type?: unknown;
  section_title?: unknown;
  page_number?: unknown;
  source_path?: unknown;
  start_offset?: unknown;
  end_offset?: unknown;
};

function previewHits(hits: RetrievalHit[], scoreField = 'score'): Array<Record<string, unknown>> {
  return hits.slice(0, 3).map((item) => ({
    chunk_id: item.chunk_id,
    filename: item.filename,
    score: Math.round(Number(item[scoreField] || 0) * 10000) / 10000,
    retrieval_source: item.retrieval_source,
    content_preview: String(item.content || '').slice(0, 120),
  }));
}

function candidateK(topK: number): number {
  return Math.max(topK * CANDIDATE_MULTIPLIER, MIN_CANDIDATE_K);
}

function rrfScore(rank: number): number {
  return 1.0 / (RRF_K + rank);
}

async function vectorRetrieveChunks(query: string, requestedCandidateK: number): Promise<RetrievalHit[]> {
  try {
    const vectorStore = getVectorStore();
    const docsWithScore = await vectorStore.similaritySearchWithScore(query, requestedCandidateK);
    logger.info(
      '[VECTOR] retrieval completed: query=%j candidate_k=%s raw_hit_count=%s',
      query,
      requestedCandidateK,
      docsWithScore.length,
    );

    const hits: RetrievalHit[] = docsWithScore.map(([document, score], index) => {
      const metadata = document.metadata || {};
      const numericScore = Number(score);
      return {
        chunk_id: metadata.chunk_id,
        document_id: metadata.document_id,
        filename: metadata.filename,
        file_type: metadata.file_type,
        chunk_index: metadata.chunk_index,
        content: document.pageContent,
        score: numericScore,
        vector_score: numericScore,
        splitter_name: metadata.splitter_name,
        parser_name: metadata.parser_name,
        section_type: metadata.section_type,
        section_title: metadata.section_title,
        page_number: metadata.page_number,
        source_path: metadata.source_path,
        start_offset: metadata.start_offset,
        end_offset: metadata.end_offset,
        retrieval_source: 'vector',
        retrieval_sources: ['vector'],
        rank_vector: index + 1,
      };
    });

    logger.info(
      '[VECTOR] retrieval preview: query=%j hit_count=%s preview=%j',
      query,
      hits.length,
      previewHits(hits, 'vector_score'),
    );
    return hits;
  } catch (error) {
    logger.exception('[VECTOR] retrieval failed: query=%j candidate_k=%s error=%s', query, requestedCandidateK, error);
    return [];
  }
}

async function bm25RetrieveChunks(query: string, requestedCandidateK: number): Promise<RetrievalHit[]> {
  try {
    const hits = (await getBm25Index().search(query, {
      top_k: requestedCandidateK,
      candidate_k: requestedCandidateK,
    })) as RetrievalHit[];
    logger.info(
      '[BM25] retrieval preview: query=%j hit_count=%s preview=%j',
      query,
      hits.length,
      previewHits(hits, 'bm25_score'),
    );
    return hits;
  } catch (error) {
    logger.exception('[BM25] retrieval failed: query=%j candidate_k=%s error=%s', query, requestedCandidateK, error);
    return [];
  }
}

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function fuseHits(
  query: string,
  vectorHits: RetrievalHit[],
  bm25Hits: RetrievalHit[],
  topK: number,
): RetrievalHit[] {
  const mergedByChunkId = new Map<string, RetrievalHit>();

  const sources: Array<['vector' | 'bm25', RetrievalHit[]]> = [
    ['vector', vectorHits],
    ['bm25', bm25Hits],
  ];

  for (const [sourceName, hits] of sources) {
    hits.forEach((hit, index) => {
      const rank = index + 1;
      const chunkId = String(hit.chunk_id || `${sourceName}:${rank}`);
      let fusedHit = mergedByChunkId.get(chunkId);
      if (!fusedHit) {
        fusedHit = {
          ...hit,
          score: Number(hit.score || 0),
          vector_score: (hit.vector_score as number | null | undefined) ?? null,
          bm25_score: (hit.bm25_score as number | null | undefined) ?? null,
          fused_score: 0,
          retrieval_sources: [],
          rank_vector: null,
          rank_bm25: null,
          rank_fused: null,
        };
        mergedByChunkId.set(chunkId, fusedHit);
      }

      if (!fusedHit.retrieval_sources?.includes(sourceName)) {
        fusedHit.retrieval_sources = [...(fusedHit.retrieval_sources ?? []), sourceName];
      }

      fusedHit.fused_score = Number(fusedHit.fused_score || 0) + rrfScore(rank);
      if (sourceName === 'vector') {
        fusedHit.vector_score = hit.vector_score as number | null | undefined;
        fusedHit.rank_vector = rank;
      } else {
        fusedHit.bm25_score = hit.bm25_score as number | null | undefined;
        fusedHit.rank_bm25 = rank;
      }

      for (const [fieldName, value] of Object.entries(hit)) {
        if (fieldName === 'retrieval_sources' || fieldName === 'retrieval_source') {
          continue;
        }
        if (isEmptyValue(fusedHit[fieldName]) && !isEmptyValue(value)) {
          fusedHit[fieldName] = value;
        }
      }
    });
  }

  const rankedHits = [...mergedByChunkId.values()].sort((left, right) => {
    const fused = Number(right.fused_score || 0) - Number(left.fused_score || 0);
    if (fused !== 0) {
      return fused;
    }
    const bm25 = Number(right.bm25_score || 0) - Number(left.bm25_score || 0);
    if (bm25 !== 0) {
      return bm25;
    }
    return Number(right.vector_score || 0) - Number(left.vector_score || 0);
  });

  rankedHits.forEach((hit, index) => {
    hit.rank_fused = index + 1;
    const sourcesList = hit.retrieval_sources ?? [];
    if (sourcesList.length > 1) {
      hit.retrieval_source = 'hybrid';
      hit.score = Number(hit.fused_score || 0);
    } else if (sourcesList.length === 1 && sourcesList[0] === 'bm25') {
      hit.retrieval_source = 'bm25';
      hit.score = Number(hit.bm25_score || 0);
    } else {
      hit.retrieval_source = 'vector';
      hit.score = Number(hit.vector_score || 0);
    }
  });

  const fusedHits = rankedHits.slice(0, topK);
  logger.info(
    '[HYBRID] fusion completed: query=%j vector_hits=%s bm25_hits=%s final_hits=%s preview=%j',
    query,
    vectorHits.length,
    bm25Hits.length,
    fusedHits.length,
    fusedHits.slice(0, 3).map((item) => ({
      chunk_id: item.chunk_id,
      filename: item.filename,
      retrieval_source: item.retrieval_source,
      vector_score: Math.round(Number(item.vector_score || 0) * 10000) / 10000,
      bm25_score: Math.round(Number(item.bm25_score || 0) * 10000) / 10000,
      fused_score: Math.round(Number(item.fused_score || 0) * 10000) / 10000,
      content_preview: String(item.content || '').slice(0, 120),
    })),
  );
  return fusedHits;
}

async function postgresFallback(db: Queryable, query: string, topK: number): Promise<RetrievalHit[]> {
  const chunks = await searchChunksIlike(db, query, topK);
  const fallbackHits: RetrievalHit[] = chunks.map((chunk) => ({
    chunk_id: chunk.id,
    document_id: chunk.document_id,
    filename: chunk.metadata_json.filename,
    file_type: chunk.metadata_json.file_type,
    chunk_index: chunk.chunk_index,
    content: chunk.content,
    score: 1.0,
    splitter_name: chunk.metadata_json.splitter_name,
    parser_name: chunk.metadata_json.parser_name,
    section_type: chunk.metadata_json.section_type,
    section_title: chunk.metadata_json.section_title,
    page_number: chunk.page_number ?? chunk.metadata_json.page_number,
    source_path: chunk.metadata_json.source_path,
    start_offset: chunk.start_offset,
    end_offset: chunk.end_offset,
    retrieval_source: 'postgres_fallback',
    retrieval_sources: ['postgres_fallback'],
  }));
  logger.info(
    '[POSTGRES] fallback retrieval: query=%j hit_count=%s preview=%j',
    query,
    fallbackHits.length,
    previewHits(fallbackHits),
  );
  return fallbackHits;
}

export async function retrieveChunks(
  db: Queryable,
  options: { query: string; top_k?: number },
): Promise<RetrievalHit[]> {
  const topK = options.top_k ?? 5;
  const cleanedQuery = options.query.trim();
  if (!cleanedQuery) {
    return [];
  }

  const requestedCandidateK = candidateK(topK);
  logger.info(
    '[RETRIEVER] hybrid retrieval started: query=%j top_k=%s candidate_k=%s',
    cleanedQuery,
    topK,
    requestedCandidateK,
  );

  const [vectorHits, bm25Hits] = await Promise.all([
    vectorRetrieveChunks(cleanedQuery, requestedCandidateK).catch((error: unknown) => {
      logger.warn('[VECTOR] retrieval failed: %s', error);
      return [] as RetrievalHit[];
    }),
    bm25RetrieveChunks(cleanedQuery, requestedCandidateK).catch((error: unknown) => {
      logger.warn('[BM25] retrieval failed: %s', error);
      return [] as RetrievalHit[];
    }),
  ]);

  const fusedHits = fuseHits(cleanedQuery, vectorHits, bm25Hits, topK);
  if (fusedHits.length > 0) {
    return fusedHits;
  }

  logger.info(
    '[RETRIEVER] hybrid retrieval returned no hits; falling back to PostgreSQL ilike: query=%j top_k=%s',
    cleanedQuery,
    topK,
  );
  return postgresFallback(db, cleanedQuery, topK);
}

export type { Bm25Record };
