import { createLogger } from '../utils/logger.js';
import { getSessionFactory } from '../core/postgres.js';
import { listEnabledChunks, type ChunkRow } from '../models/chunk.js';

const logger = createLogger('rag.bm25_index');

const LATIN_TOKEN_PATTERN = /[a-z0-9][a-z0-9._:/-]*/g;
const CJK_SEGMENT_PATTERN = /[\u4e00-\u9fff]+/g;

export function tokenizeForBm25(text: string): string[] {
  const normalizedText = String(text || '').trim().toLowerCase();
  if (!normalizedText) {
    return [];
  }

  const tokens: string[] = [];
  const latinMatches = normalizedText.match(LATIN_TOKEN_PATTERN);
  if (latinMatches) {
    tokens.push(...latinMatches);
  }

  const cjkSegments = normalizedText.match(CJK_SEGMENT_PATTERN) ?? [];
  for (const segment of cjkSegments) {
    if (!segment) {
      continue;
    }
    if (segment.length === 1) {
      tokens.push(segment);
      continue;
    }
    for (let index = 0; index < segment.length - 1; index += 1) {
      tokens.push(segment.slice(index, index + 2));
    }
    tokens.push(...segment.split(''));
  }

  return tokens.filter((token) => token.length > 0);
}

function buildLexicalDocument(chunk: ChunkRow): string {
  const metadata = chunk.metadata_json || {};
  const filename = String(metadata.filename || '').trim();
  const sectionTitle = String(metadata.section_title || '').trim();
  const sectionType = String(metadata.section_type || '').trim();
  const parserName = String(metadata.parser_name || '').trim();
  const splitterName = String(metadata.splitter_name || '').trim();

  const lexicalParts = [
    filename,
    filename,
    sectionTitle,
    sectionTitle,
    sectionType,
    parserName,
    splitterName,
    chunk.content,
  ];
  return lexicalParts.filter((part) => part).join('\n');
}

/**
 * BM25Okapi matching Python `rank_bm25.BM25Okapi` (k1=1.5, b=0.75, epsilon=0.25).
 */
export class BM25Okapi {
  private readonly k1: number;
  private readonly b: number;
  private readonly epsilon: number;
  private readonly corpusSize: number;
  private readonly avgdl: number;
  private readonly docFreqs: Array<Map<string, number>>;
  private readonly docLen: number[];
  private readonly idf: Map<string, number>;

  constructor(corpus: string[][], k1 = 1.5, b = 0.75, epsilon = 0.25) {
    this.k1 = k1;
    this.b = b;
    this.epsilon = epsilon;
    this.docFreqs = [];
    this.docLen = [];
    this.idf = new Map();

    const documentFrequency = new Map<string, number>();
    let tokenCount = 0;
    for (const document of corpus) {
      this.docLen.push(document.length);
      tokenCount += document.length;
      const frequencies = new Map<string, number>();
      for (const word of document) {
        frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
      }
      this.docFreqs.push(frequencies);
      for (const word of frequencies.keys()) {
        documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
      }
    }

    this.corpusSize = corpus.length;
    this.avgdl = this.corpusSize > 0 ? tokenCount / this.corpusSize : 0;

    let idfSum = 0;
    const negativeIdfs: string[] = [];
    for (const [word, freq] of documentFrequency.entries()) {
      const idf = Math.log(this.corpusSize - freq + 0.5) - Math.log(freq + 0.5);
      this.idf.set(word, idf);
      idfSum += idf;
      if (idf < 0) {
        negativeIdfs.push(word);
      }
    }

    const averageIdf = this.idf.size > 0 ? idfSum / this.idf.size : 0;
    const eps = this.epsilon * averageIdf;
    for (const word of negativeIdfs) {
      this.idf.set(word, eps);
    }
  }

  getScores(query: string[]): number[] {
    const scores = new Array<number>(this.corpusSize).fill(0);
    for (const term of query) {
      const inverseDocumentFrequency = this.idf.get(term) ?? 0;
      if (inverseDocumentFrequency === 0) {
        continue;
      }
      for (let index = 0; index < this.corpusSize; index += 1) {
        const termFrequency = this.docFreqs[index].get(term) ?? 0;
        const denominator =
          termFrequency + this.k1 * (1 - this.b + (this.b * this.docLen[index]) / (this.avgdl || 1));
        scores[index] += inverseDocumentFrequency * ((termFrequency * (this.k1 + 1)) / denominator);
      }
    }
    return scores;
  }
}

export interface Bm25Record {
  chunk_id: string;
  document_id: string;
  filename: unknown;
  file_type: unknown;
  chunk_index: number;
  content: string;
  splitter_name: unknown;
  parser_name: unknown;
  section_type: unknown;
  section_title: unknown;
  page_number: unknown;
  source_path: unknown;
  start_offset: number | null;
  end_offset: number | null;
  bm25_tokens?: string[];
  score?: number;
  bm25_score?: number;
  retrieval_source?: string;
  retrieval_sources?: string[];
  rank_bm25?: number;
}

class AsyncLock {
  private chain = Promise.resolve();

  async run<T>(fn: () => Promise<T> | T): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.chain;
    this.chain = this.chain.then(() => next);
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export class BM25IndexManager {
  private readonly lock = new AsyncLock();
  private dirty = true;
  private bm25: BM25Okapi | null = null;
  private records: Bm25Record[] = [];
  private rebuildCount = 0;
  private lastDirtyReason = 'initial';

  markDirty(reason: string): void {
    this.dirty = true;
    this.lastDirtyReason = reason;
    logger.info('[BM25] index marked dirty: reason=%s', reason);
  }

  async ensureReady(): Promise<void> {
    const needsRebuild = await this.lock.run(() => this.dirty || this.bm25 === null);
    if (needsRebuild) {
      await this.rebuild();
    }
  }

  async rebuild(): Promise<void> {
    const factory = getSessionFactory();
    const chunks = await factory.withClient(async (db) => listEnabledChunks(db));

    const records: Bm25Record[] = [];
    const tokenizedCorpus: string[][] = [];
    let skippedCount = 0;

    for (const chunk of chunks) {
      const lexicalText = buildLexicalDocument(chunk);
      const tokens = tokenizeForBm25(lexicalText);
      if (tokens.length === 0) {
        skippedCount += 1;
        continue;
      }
      const metadata = chunk.metadata_json || {};
      records.push({
        chunk_id: chunk.id,
        document_id: chunk.document_id,
        filename: metadata.filename,
        file_type: metadata.file_type,
        chunk_index: chunk.chunk_index,
        content: chunk.content,
        splitter_name: metadata.splitter_name,
        parser_name: metadata.parser_name,
        section_type: metadata.section_type,
        section_title: metadata.section_title,
        page_number: chunk.page_number ?? metadata.page_number,
        source_path: metadata.source_path,
        start_offset: chunk.start_offset,
        end_offset: chunk.end_offset,
        bm25_tokens: tokens,
      });
      tokenizedCorpus.push(tokens);
    }

    const bm25 = tokenizedCorpus.length > 0 ? new BM25Okapi(tokenizedCorpus) : null;

    let rebuildCount = 0;
    let dirtyReason = this.lastDirtyReason;
    await this.lock.run(() => {
      this.bm25 = bm25;
      this.records = records;
      this.dirty = false;
      this.rebuildCount += 1;
      rebuildCount = this.rebuildCount;
      dirtyReason = this.lastDirtyReason;
    });

    logger.info(
      '[BM25] rebuild completed: reason=%s total_chunks=%s indexed_chunks=%s skipped_chunks=%s rebuild_count=%s preview=%j',
      dirtyReason,
      chunks.length,
      records.length,
      skippedCount,
      rebuildCount,
      records.slice(0, 3).map((item) => ({
        chunk_id: item.chunk_id,
        filename: item.filename,
        chunk_index: item.chunk_index,
        token_count: (item.bm25_tokens ?? []).length,
      })),
    );
  }

  async search(query: string, options: { top_k?: number; candidate_k?: number | null } = {}): Promise<Bm25Record[]> {
    const topK = options.top_k ?? 5;
    const candidateK = options.candidate_k;
    await this.ensureReady();

    const tokenizedQuery = tokenizeForBm25(query);
    if (tokenizedQuery.length === 0) {
      logger.info('[BM25] search skipped: empty tokenized query=%j', query);
      return [];
    }

    const snapshot = await this.lock.run(() => ({
      bm25: this.bm25,
      records: [...this.records],
    }));

    if (!snapshot.bm25 || snapshot.records.length === 0) {
      logger.info('[BM25] search skipped: index is empty query=%j', query);
      return [];
    }

    const scores = snapshot.bm25.getScores(tokenizedQuery);
    const rankedScores = scores
      .map((score, index) => [index, score] as const)
      .sort((left, right) => right[1] - left[1]);

    const effectiveCandidateK = candidateK ?? Math.max(topK, topK * 4);
    const hits: Bm25Record[] = [];
    for (let rank = 0; rank < rankedScores.length; rank += 1) {
      const [index, score] = rankedScores[rank];
      if (score <= 0) {
        continue;
      }
      const record = { ...snapshot.records[index] };
      delete record.bm25_tokens;
      record.score = score;
      record.bm25_score = score;
      record.retrieval_source = 'bm25';
      record.retrieval_sources = ['bm25'];
      record.rank_bm25 = rank + 1;
      hits.push(record);
      if (hits.length >= effectiveCandidateK) {
        break;
      }
    }

    logger.info(
      '[BM25] search completed: query=%j tokens=%j indexed_chunks=%s candidate_k=%s hit_count=%s preview=%j',
      query,
      tokenizedQuery.slice(0, 12),
      snapshot.records.length,
      effectiveCandidateK,
      hits.length,
      hits.slice(0, 3).map((item) => ({
        chunk_id: item.chunk_id,
        filename: item.filename,
        bm25_score: Math.round(Number(item.bm25_score ?? 0) * 10000) / 10000,
        content_preview: String(item.content || '').slice(0, 120),
      })),
    );
    return hits;
  }
}

let cachedIndex: BM25IndexManager | null = null;

export function getBm25Index(): BM25IndexManager {
  if (!cachedIndex) {
    cachedIndex = new BM25IndexManager();
  }
  return cachedIndex;
}
