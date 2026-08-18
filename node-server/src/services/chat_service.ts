import { AIMessage, ToolMessage } from '@langchain/core/messages';

import { getRagAgent } from '../agent/graph.js';
import { clearThreadMemory } from '../agent/memory.js';
import { RetrievalTrace, bindRetrievalTrace } from '../agent/runtime.js';
import { withSession } from '../core/postgres.js';
import { insertQueryLog } from '../models/queryLog.js';
import { retrieveChunks } from '../rag/retriever.js';
import {
  type ChatHistoryItem,
  type ChatResponse,
  type SessionClearResponse,
  type SessionSummaryItem,
  type SourceChunkItem,
  toSourceChunkItem,
} from '../schemas/chat.js';
import { formatSseEvent } from '../utils/sse.js';
import { logger } from '../utils/logger.js';

export type ChatRunResult = {
  session_id: string;
  answer: string;
  latency_ms: number;
  source_chunks: Record<string, unknown>[];
  route: string;
  created_at: Date;
};

type QueryLogRow = {
  id: string;
  session_id: string | null;
  user_question: string;
  answer: string | null;
  route: string;
  latency_ms: number | null;
  source_chunks: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

type SessionSummaryRow = QueryLogRow & {
  message_count?: number | string;
};

function isAiMessage(message: unknown): message is AIMessage {
  return message instanceof AIMessage || (Boolean(message) && (message as { _getType?: () => string })._getType?.() === 'ai');
}

function isToolMessage(message: unknown): message is ToolMessage {
  return message instanceof ToolMessage || (Boolean(message) && (message as { _getType?: () => string })._getType?.() === 'tool');
}

function messageText(message: { text?: unknown; content?: unknown }): string {
  if (typeof message.text === 'string' && message.text.trim()) {
    return message.text.trim();
  }
  if (typeof message.content === 'string') {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((block) => {
        if (typeof block === 'string') {
          return block;
        }
        if (block && typeof block === 'object' && 'text' in block) {
          return String((block as { text?: unknown }).text ?? '');
        }
        return '';
      })
      .join('');
  }
  return String(message.content ?? '');
}

export class ChatService {
  private readonly agent = getRagAgent();

  private buildAgentInput(message: string, prefetchedChunks: Record<string, unknown>[] | null = null) {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (prefetchedChunks && prefetchedChunks.length > 0) {
      messages.push({
        role: 'system',
        content:
          '以下是系统在回答前已从知识库中检索到的高相关片段，请优先基于这些内容回答。' +
          '如果这些片段与问题直接相关，请优先引用它们，并使用 `[1]`、`[2]` 这样的编号标记来源。\n\n' +
          this.formatPrefetchedContext(prefetchedChunks),
      });
    }
    messages.push({ role: 'user', content: message });
    return { messages };
  }

  private buildAgentConfig(sessionId: string) {
    return { configurable: { thread_id: sessionId } };
  }

  private extractFinalAnswer(result: { messages?: unknown[] }): string {
    const messages = result.messages ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (!isAiMessage(message)) {
        continue;
      }
      const content = messageText(message);
      if (content.trim()) {
        return content.trim();
      }
    }
    return '';
  }

  private formatPrefetchedContext(prefetchedChunks: Record<string, unknown>[]): string {
    return prefetchedChunks.slice(0, 5).map((item, offset) => {
      const index = offset + 1;
      return [
        `[${index}] filename=${item.filename ?? 'unknown'}`,
        `chunk_id=${item.chunk_id ?? 'unknown'}`,
        `chunk_index=${item.chunk_index}`,
        `page_number=${item.page_number}`,
        `retrieval_source=${item.retrieval_source}`,
        `score=${item.score}`,
        `content=${String(item.content ?? '').slice(0, 500)}`,
      ].join('\n');
    }).join('\n\n');
  }

  private sourcePreview(sourceChunks: Record<string, unknown>[]): Record<string, unknown>[] {
    return sourceChunks.slice(0, 3).map((item) => ({
      ref_id: item.ref_id,
      chunk_id: item.chunk_id,
      filename: item.filename,
      retrieval_source: item.retrieval_source,
      score: item.score,
      vector_score: item.vector_score,
      bm25_score: item.bm25_score,
      fused_score: item.fused_score,
    }));
  }

  private normalizeSourceChunks(sourceChunks: Record<string, unknown>[] | null | undefined): Record<string, unknown>[] {
    return (sourceChunks ?? []).map((sourceChunk, offset) => {
      const index = offset + 1;
      return {
        ref_id: Number(sourceChunk.ref_id ?? index),
        chunk_id: sourceChunk.chunk_id ?? null,
        document_id: sourceChunk.document_id ?? null,
        filename: sourceChunk.filename ?? sourceChunk.file_name ?? null,
        file_name: sourceChunk.file_name ?? sourceChunk.filename ?? null,
        file_type: sourceChunk.file_type ?? null,
        chunk_index: sourceChunk.chunk_index ?? null,
        content: sourceChunk.content ?? '',
        score: Number(sourceChunk.score ?? 0),
        vector_score: sourceChunk.vector_score != null ? Number(sourceChunk.vector_score) : null,
        bm25_score: sourceChunk.bm25_score != null ? Number(sourceChunk.bm25_score) : null,
        fused_score: sourceChunk.fused_score != null ? Number(sourceChunk.fused_score) : null,
        retrieval_source: sourceChunk.retrieval_source ?? null,
        retrieval_sources: Array.isArray(sourceChunk.retrieval_sources) ? sourceChunk.retrieval_sources : [],
        rank_vector: sourceChunk.rank_vector ?? null,
        rank_bm25: sourceChunk.rank_bm25 ?? null,
        rank_fused: sourceChunk.rank_fused ?? null,
        splitter_name: sourceChunk.splitter_name ?? null,
        parser_name: sourceChunk.parser_name ?? null,
        section_type: sourceChunk.section_type ?? null,
        section_title: sourceChunk.section_title ?? null,
        page_number: sourceChunk.page_number ?? null,
        source_path: sourceChunk.source_path ?? null,
        start_offset: sourceChunk.start_offset ?? null,
        end_offset: sourceChunk.end_offset ?? null,
      };
    });
  }

  private async prefetchSourceChunks(params: { message: string; topK: number }): Promise<Record<string, unknown>[]> {
    const prefetchedHits = await withSession(async (db) => {
      return retrieveChunks(db, {
        query: params.message,
        top_k: params.topK,
      });
    });
    const normalizedHits = this.normalizeSourceChunks(prefetchedHits as Record<string, unknown>[]);
    logger.info(
      `[CHAT] prefetch retrieval: query=${JSON.stringify(params.message)} top_k=${params.topK} hit_count=${normalizedHits.length} preview=${JSON.stringify(this.sourcePreview(normalizedHits))}`,
    );
    return normalizedHits;
  }

  private async persistQueryLog(params: { sessionId: string; question: string; result: ChatRunResult }): Promise<void> {
    await withSession(async (db) => {
      await insertQueryLog(db, {
        session_id: params.sessionId,
        user_question: params.question,
        answer: params.result.answer,
        route: params.result.route,
        latency_ms: params.result.latency_ms,
        source_chunks: params.result.source_chunks as unknown[],
      });
    });
  }

  private serializeHistoryItem(queryLog: QueryLogRow): ChatHistoryItem {
    const sourceChunks = this.normalizeSourceChunks(
      (Array.isArray(queryLog.source_chunks) ? queryLog.source_chunks : []) as Record<string, unknown>[],
    );
    return {
      id: queryLog.id,
      session_id: queryLog.session_id,
      user_question: queryLog.user_question,
      answer: queryLog.answer,
      route: queryLog.route,
      latency_ms: queryLog.latency_ms,
      source_chunks: sourceChunks.map((item) => toSourceChunkItem(item)),
      created_at: new Date(queryLog.created_at),
      updated_at: new Date(queryLog.updated_at),
    };
  }

  private toApiSourceChunks(sourceChunks: Record<string, unknown>[]): SourceChunkItem[] {
    return sourceChunks.map((item) => toSourceChunkItem(item));
  }

  async invoke(params: { sessionId: string; message: string; topK?: number }): Promise<ChatResponse> {
    const topK = params.topK ?? 5;
    const startedAt = performance.now();
    logger.info(
      `[CHAT] invoke started: session=${params.sessionId} top_k=${topK} message_length=${params.message.length} message_preview=${JSON.stringify(params.message.slice(0, 120))}`,
    );

    const trace = new RetrievalTrace(topK);
    let result: { messages?: unknown[] };
    try {
      result = await bindRetrievalTrace(trace, async () => {
        const prefetchedChunks = await this.prefetchSourceChunks({ message: params.message, topK });
        if (prefetchedChunks.length > 0) {
          trace.source_chunks = prefetchedChunks;
        }
        return this.agent.invoke(
          this.buildAgentInput(params.message, prefetchedChunks),
          this.buildAgentConfig(params.sessionId),
        );
      });
    } catch (error) {
      logger.exception('Chat invoke failed for session=%s', params.sessionId, error);
      throw new Error(`Agent 对话执行失败: ${error instanceof Error ? error.message : String(error)}`);
    }

    const answer = this.extractFinalAnswer(result);
    const latencyMs = Math.trunc(performance.now() - startedAt);
    const sourceChunks = this.normalizeSourceChunks(trace.source_chunks);
    const chatResult: ChatRunResult = {
      session_id: params.sessionId,
      answer,
      latency_ms: latencyMs,
      source_chunks: sourceChunks,
      route: 'agent_rag',
      created_at: new Date(),
    };
    await this.persistQueryLog({ sessionId: params.sessionId, question: params.message, result: chatResult });
    logger.info(
      `[CHAT] invoke finished: session=${params.sessionId} latency_ms=${latencyMs} answer_length=${answer.length} source_chunk_count=${sourceChunks.length} source_preview=${JSON.stringify(this.sourcePreview(sourceChunks))}`,
    );

    return {
      session_id: params.sessionId,
      answer,
      route: chatResult.route,
      latency_ms: latencyMs,
      source_chunks: this.toApiSourceChunks(sourceChunks),
      created_at: chatResult.created_at,
    };
  }

  async *stream(params: { sessionId: string; message: string; topK?: number }): AsyncGenerator<string> {
    const topK = params.topK ?? 5;
    const startedAt = performance.now();
    const answerFragments: string[] = [];
    const trace = new RetrievalTrace(topK);

    logger.info(
      `[CHAT] stream started: session=${params.sessionId} top_k=${topK} message_length=${params.message.length} message_preview=${JSON.stringify(params.message.slice(0, 120))}`,
    );
    yield formatSseEvent('status', { phase: 'started', session_id: params.sessionId });

    try {
      const prefetchedChunks = await this.prefetchSourceChunks({ message: params.message, topK });
      if (prefetchedChunks.length > 0) {
        trace.source_chunks = prefetchedChunks;
        yield formatSseEvent('sources', { items: this.toApiSourceChunks(prefetchedChunks) });
        yield formatSseEvent('status', {
          phase: 'retrieved',
          session_id: params.sessionId,
          source_chunk_count: prefetchedChunks.length,
        });
      }

      logger.info(
        `[CHAT] stream calling agent: session=${params.sessionId} thread_id=${this.buildAgentConfig(params.sessionId).configurable.thread_id} prefetched_hits=${prefetchedChunks.length}`,
      );

      const eventQueue: string[] = [];
      let notify: (() => void) | undefined;
      let producerError: unknown;
      let producerDone = false;

      const produced = bindRetrievalTrace(trace, async () => {
        for await (const event of this.streamAgentEvents({
          sessionId: params.sessionId,
          message: params.message,
          prefetchedChunks,
          answerFragments,
        })) {
          eventQueue.push(event);
          notify?.();
        }
      });

      void produced.then(
        () => {
          producerDone = true;
          notify?.();
        },
        (error: unknown) => {
          producerError = error;
          producerDone = true;
          notify?.();
        },
      );

      while (!producerDone || eventQueue.length > 0) {
        if (eventQueue.length === 0) {
          await new Promise<void>((resolve) => {
            notify = resolve;
          });
        }
        while (eventQueue.length > 0) {
          yield eventQueue.shift() as string;
        }
        if (producerError) {
          throw producerError;
        }
      }
    } catch (error) {
      logger.exception('Chat stream failed for session=%s', params.sessionId, error);
      yield formatSseEvent('error', {
        session_id: params.sessionId,
        message: `Agent 流式对话执行失败: ${error instanceof Error ? error.message : String(error)}`,
      });
      yield formatSseEvent('done', { session_id: params.sessionId, ok: false });
      return;
    }

    const answer = answerFragments.join('').trim();
    const latencyMs = Math.trunc(performance.now() - startedAt);
    const sourceChunks = this.normalizeSourceChunks(trace.source_chunks);
    logger.info(
      `[CHAT] stream finished: session=${params.sessionId} latency_ms=${latencyMs} answer_length=${answer.length} source_chunk_count=${sourceChunks.length} source_preview=${JSON.stringify(this.sourcePreview(sourceChunks))}`,
    );

    const chatResult: ChatRunResult = {
      session_id: params.sessionId,
      answer,
      latency_ms: latencyMs,
      source_chunks: sourceChunks,
      route: 'agent_rag',
      created_at: new Date(),
    };
    await this.persistQueryLog({ sessionId: params.sessionId, question: params.message, result: chatResult });

    yield formatSseEvent('sources', { items: this.toApiSourceChunks(sourceChunks) });
    yield formatSseEvent('done', {
      session_id: params.sessionId,
      answer,
      route: chatResult.route,
      latency_ms: latencyMs,
      created_at: chatResult.created_at.toISOString(),
    });
  }

  private async *streamAgentEvents(params: {
    sessionId: string;
    message: string;
    prefetchedChunks: Record<string, unknown>[];
    answerFragments: string[];
  }): AsyncGenerator<string> {
    for await (const event of this.agent.stream(
      this.buildAgentInput(params.message, params.prefetchedChunks),
      this.buildAgentConfig(params.sessionId),
      ['updates', 'messages'],
    )) {
      const streamMode = event.mode;
      const chunk = event.chunk;

      if (streamMode === 'messages') {
        const [token, metadata] = Array.isArray(chunk) ? chunk : [chunk, {}];
        if ((metadata as { langgraph_node?: string }).langgraph_node !== 'model') {
          continue;
        }
        const contentBlocks =
          ((token as { content_blocks?: Array<Record<string, unknown>> }).content_blocks ?? []) as Array<
            Record<string, unknown>
          >;
        for (const block of contentBlocks) {
          if (block.type !== 'text') {
            continue;
          }
          const textDelta = String(block.text ?? '');
          if (!textDelta) {
            continue;
          }
          params.answerFragments.push(textDelta);
          yield formatSseEvent('token', { text: textDelta });
        }
        continue;
      }

      if (streamMode !== 'updates' || !chunk || typeof chunk !== 'object') {
        continue;
      }

      for (const [stepName, stepData] of Object.entries(chunk as Record<string, { messages?: unknown[] }>)) {
        const messages = stepData?.messages ?? [];
        if (!messages.length) {
          continue;
        }
        const latestMessage = messages[messages.length - 1];
        if (isAiMessage(latestMessage)) {
          const toolCalls = latestMessage.tool_calls ?? [];
          for (const toolCall of toolCalls) {
            yield formatSseEvent('tool_call', {
              step: stepName,
              tool_name: toolCall.name,
              tool_call_id: toolCall.id,
              args: toolCall.args,
            });
          }
        } else if (isToolMessage(latestMessage)) {
          const toolStatus = (latestMessage as ToolMessage & { status?: string }).status || 'success';
          yield formatSseEvent(toolStatus === 'error' ? 'tool_error' : 'tool_result', {
            step: stepName,
            tool_call_id: latestMessage.tool_call_id,
            status: toolStatus,
            content: String(latestMessage.content),
          });
        }
      }
    }
  }

  async clearSession(sessionId: string): Promise<SessionClearResponse> {
    const deleted = await withSession(async (db) => {
      const result = await db.query('DELETE FROM query_log WHERE session_id = $1', [sessionId]);
      return Number(result.rowCount ?? 0);
    });

    let clearedMemory = false;
    try {
      clearedMemory = clearThreadMemory(sessionId);
    } catch (error) {
      logger.warn(`Failed to clear thread memory for session=${sessionId}: ${String(error)}`);
    }

    return {
      session_id: sessionId,
      deleted_query_log_count: deleted,
      cleared_memory: clearedMemory,
    };
  }

  async getSessionHistory(sessionId: string, params: { limit?: number } = {}): Promise<ChatHistoryItem[]> {
    const limit = params.limit ?? 50;
    const queryLogs = await withSession(async (db) => {
      const result = await db.query(
        `SELECT * FROM query_log
         WHERE session_id = $1
         ORDER BY created_at ASC
         LIMIT $2`,
        [sessionId, limit],
      );
      return result.rows as QueryLogRow[];
    });
    return queryLogs.map((queryLog) => this.serializeHistoryItem(queryLog));
  }

  async listSessions(params: { limit?: number } = {}): Promise<SessionSummaryItem[]> {
    const limit = params.limit ?? 50;
    const rows = await withSession(async (db) => {
      const result = await db.query(
        `WITH latest AS (
           SELECT session_id,
                  MAX(created_at) AS latest_created_at,
                  COUNT(id) AS message_count
           FROM query_log
           WHERE session_id IS NOT NULL
           GROUP BY session_id
         )
         SELECT q.*, latest.message_count
         FROM query_log q
         JOIN latest
           ON q.session_id = latest.session_id
          AND q.created_at = latest.latest_created_at
         ORDER BY q.created_at DESC
         LIMIT $1`,
        [limit],
      );
      return result.rows as SessionSummaryRow[];
    });

    return rows
      .filter((row) => Boolean(row.session_id))
      .map((row) => ({
        session_id: row.session_id ?? '',
        latest_question: row.user_question,
        latest_answer: row.answer,
        message_count: Number(row.message_count ?? 0),
        updated_at: new Date(row.updated_at),
      }));
  }
}
