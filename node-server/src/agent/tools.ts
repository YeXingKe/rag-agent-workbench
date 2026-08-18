import { z } from 'zod';

import { getCurrentRetrievalTrace } from './runtime.js';
import type { Queryable } from '../core/postgres.js';
import { withSession } from '../core/postgres.js';
import { retrieveChunks } from '../rag/retriever.js';
import { logger } from '../utils/logger.js';

export const searchKnowledgeBaseInputSchema = z.object({
  query: z.string().describe('需要检索的用户问题或关键词'),
  top_k: z.number().int().min(1).max(8).default(5).describe('返回最相关的片段数量'),
});

export type SearchKnowledgeBaseInput = z.infer<typeof searchKnowledgeBaseInputSchema>;

export const SEARCH_KNOWLEDGE_BASE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'search_knowledge_base',
    description: [
      '检索知识库中与问题最相关的内容片段，并返回可引用的来源编号。',
      '',
      '使用场景：',
      '- 用户询问项目文档、系统规范、配置说明、知识库内容；',
      '- 需要基于已入库的 chunk 回答问题；',
      '- 需要给最终答案附带可追溯来源。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '需要检索的用户问题或关键词',
        },
        top_k: {
          type: 'integer',
          description: '返回最相关的片段数量',
          minimum: 1,
          maximum: 8,
          default: 5,
        },
      },
      required: ['query'],
    },
  },
};

function truncateContent(content: string, maxLength = 400): string {
  const normalized = String(content ?? '')
    .split(/\s+/)
    .join(' ')
    .trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

async function runWithDb<T>(fn: (db: Queryable) => Promise<T>): Promise<T> {
  return withSession(fn);
}

export async function searchKnowledgeBase(query: string, top_k = 5): Promise<string> {
  const parsed = searchKnowledgeBaseInputSchema.parse({ query, top_k });
  const trace = getCurrentRetrievalTrace();
  const effectiveTopK = trace != null ? Math.min(parsed.top_k, trace.top_k) : parsed.top_k;

  logger.info(
    `[TOOL][KB] called: query=${JSON.stringify(parsed.query)} requested_top_k=${parsed.top_k} effective_top_k=${effectiveTopK} trace_bound=${trace != null}`,
  );

  const hits = await runWithDb(async (db) => {
    return retrieveChunks(db, { query: parsed.query, top_k: effectiveTopK });
  });

  if (!hits || hits.length === 0) {
    logger.info(
      `[TOOL][KB] no hits: query=${JSON.stringify(parsed.query)} effective_top_k=${effectiveTopK}`,
    );
    if (trace != null) {
      trace.source_chunks = [];
    }
    return '未检索到相关知识库内容。';
  }

  const normalizedHits: Record<string, unknown>[] = [];
  const lines: string[] = [];

  hits.forEach((hit, offset) => {
    const index = offset + 1;
    const record = hit as Record<string, unknown>;
    const normalizedHit = {
      ...record,
      ref_id: index,
      content: truncateContent(String(record.content ?? '')),
    };
    normalizedHits.push(normalizedHit);
    lines.push(
      [
        `[${index}] filename=${record.filename ?? 'unknown'}`,
        `chunk_id=${record.chunk_id ?? 'unknown'}`,
        `chunk_index=${record.chunk_index}`,
        `page_number=${record.page_number}`,
        `retrieval_source=${record.retrieval_source}`,
        `score=${record.score}`,
        `vector_score=${record.vector_score}`,
        `bm25_score=${record.bm25_score}`,
        `fused_score=${record.fused_score}`,
        `content=${normalizedHit.content}`,
      ].join('\n'),
    );
  });

  if (trace != null) {
    trace.source_chunks = normalizedHits;
  }

  logger.info(
    `[TOOL][KB] returning hits: query=${JSON.stringify(parsed.query)} hit_count=${normalizedHits.length} preview=${JSON.stringify(
      normalizedHits.slice(0, 3).map((item) => ({
        ref_id: item.ref_id,
        chunk_id: item.chunk_id,
        filename: item.filename,
        retrieval_source: item.retrieval_source,
        score: item.score,
        vector_score: item.vector_score,
        bm25_score: item.bm25_score,
        fused_score: item.fused_score,
        content_preview: String(item.content ?? '').slice(0, 120),
      })),
    )}`,
  );

  return lines.join('\n\n');
}

export function getAgentTools(): Array<{
  name: string;
  schema: typeof SEARCH_KNOWLEDGE_BASE_TOOL;
  invoke: (args: SearchKnowledgeBaseInput) => Promise<string>;
}> {
  return [
    {
      name: 'search_knowledge_base',
      schema: SEARCH_KNOWLEDGE_BASE_TOOL,
      invoke: async (args) => searchKnowledgeBase(args.query, args.top_k ?? 5),
    },
  ];
}
