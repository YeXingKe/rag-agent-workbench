/**
 * 对话服务。
 *
 * 把 Agent 调用、SSE 适配、预检索与查询日志统一放在 service 层，
 * 避免 API 层直接处理 LangChain / ReAct 细节。
 *
 * SSE 事件含义（stream 方法产出）：
 * - status：阶段进度，如 started / retrieved
 * - sources：溯源片段列表（预检索后或结束前）
 * - token：回答文本增量
 * - tool_call：模型发起工具调用
 * - tool_result / tool_error：工具执行成功或失败
 * - error：流式过程异常
 * - done：本轮结束（含最终 answer / latency_ms）
 */

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

/** 一次对话调用的标准化内部结果。 */
export type ChatRunResult = {
  /** 会话标识符 */
  session_id: string;
  /** AI 生成的回答 */
  answer: string;
  /** 响应延迟（毫秒） */
  latency_ms: number;
  /** 检索到的知识库来源片段 */
  source_chunks: Record<string, unknown>[];
  /** 路由类型，默认 agent_rag */
  route: string;
  /** 创建时间 */
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

/** 判断是否为 AI 消息。 */
function isAiMessage(message: unknown): message is AIMessage {
  return message instanceof AIMessage || (Boolean(message) && (message as { _getType?: () => string })._getType?.() === 'ai');
}

/** 判断是否为工具消息。 */
function isToolMessage(message: unknown): message is ToolMessage {
  return message instanceof ToolMessage || (Boolean(message) && (message as { _getType?: () => string })._getType?.() === 'tool');
}

/** 从消息对象提取可读文本（兼容 content string / blocks）。 */
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

/**
 * 对话服务：同步 invoke、流式 stream、会话历史与清空。
 */
export class ChatService {
  private readonly agent = getRagAgent();

  /**
   * 构造 Agent 输入：可选注入预检索上下文的 system 消息，再追加用户问题。
   */
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

  /** 用 sessionId 作为 checkpointer 的 thread_id。 */
  private buildAgentConfig(sessionId: string) {
    return { configurable: { thread_id: sessionId } };
  }

  /** 从 Agent 结果消息列表中倒序找最后一条非空 AI 回答。 */
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

  /** 把预检索片段格式化为注入 system 的可读文本（最多 5 条）。 */
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

  /** 日志用：截取来源预览字段（前 3 条）。 */
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

  /** 规范化来源字段，保证响应体和日志结构稳定。 */
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

  /** 在进入 Agent 前先做一次确定性的知识库预检索。 */
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

  /** 把一次问答结果落到 query_log 表。 */
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

  /** 把数据库查询日志转成接口层历史项。 */
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

  /** 内部来源片段 → API SourceChunkItem。 */
  private toApiSourceChunks(sourceChunks: Record<string, unknown>[]): SourceChunkItem[] {
    return sourceChunks.map((item) => toSourceChunkItem(item));
  }

  /**
   * 同步问答：预检索 → Agent.invoke → 落库 → 返回完整 ChatResponse。
   */
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

  /**
   * SSE 流式问答：先发 status/sources，再桥接 Agent 事件，最后落库并发 done。
   *
   * 使用队列 + notify 把异步 producer 与 async generator 解耦，
   * 保证 bindRetrievalTrace 覆盖整个 Agent 流式过程。
   */
  async *stream(params: { sessionId: string; message: string; topK?: number }): AsyncGenerator<string> {
    const topK = params.topK ?? 5;
    const startedAt = performance.now();
    const answerFragments: string[] = [];
    const trace = new RetrievalTrace(topK);

    logger.info(
      `[CHAT] stream started: session=${params.sessionId} top_k=${topK} message_length=${params.message.length} message_preview=${JSON.stringify(params.message.slice(0, 120))}`,
    );
    // SSE: status — 流式开始
    yield formatSseEvent('status', { phase: 'started', session_id: params.sessionId });

    try {
      const prefetchedChunks = await this.prefetchSourceChunks({ message: params.message, topK });
      if (prefetchedChunks.length > 0) {
        trace.source_chunks = prefetchedChunks;
        // SSE: sources — 预检索命中
        yield formatSseEvent('sources', { items: this.toApiSourceChunks(prefetchedChunks) });
        // SSE: status — 检索完成
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
      // SSE: error — 流式失败
      yield formatSseEvent('error', {
        session_id: params.sessionId,
        message: `Agent 流式对话执行失败: ${error instanceof Error ? error.message : String(error)}`,
      });
      // SSE: done — 失败收尾
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

    // SSE: sources — 最终溯源（可能含工具二次检索结果）
    yield formatSseEvent('sources', { items: this.toApiSourceChunks(sourceChunks) });
    // SSE: done — 正常结束，携带最终答案与耗时
    yield formatSseEvent('done', {
      session_id: params.sessionId,
      answer,
      route: chatResult.route,
      latency_ms: latencyMs,
      created_at: chatResult.created_at.toISOString(),
    });
  }

  /**
   * 消费 Agent.stream 事件并映射为 SSE 字符串。
   *
   * - messages + model 节点文本块 → event: token
   * - updates 中 AIMessage.tool_calls → event: tool_call
   * - updates 中 ToolMessage → event: tool_result 或 tool_error
   */
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
          // SSE: token — 回答增量
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
            // SSE: tool_call — 模型请求调用工具
            yield formatSseEvent('tool_call', {
              step: stepName,
              tool_name: toolCall.name,
              tool_call_id: toolCall.id,
              args: toolCall.args,
            });
          }
        } else if (isToolMessage(latestMessage)) {
          const toolStatus = (latestMessage as ToolMessage & { status?: string }).status || 'success';
          // SSE: tool_result / tool_error — 工具返回
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

  /**
   * 清空指定会话：删除 query_log，并清理短期记忆。
   */
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

  /** 返回指定会话的问答历史（按创建时间升序）。 */
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

  /** 返回最近会话摘要列表（每会话取最新一条问答）。 */
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
