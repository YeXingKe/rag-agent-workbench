/**
 * 对话 API 路由。
 *
 * 同步问答、SSE 流式问答、会话列表/历史与清空；
 * Agent / 日志细节放在 ChatService，本层只做参数校验与 HTTP 适配。
 */

import { Router } from 'express';
import { z, ZodError } from 'zod';

import { chatRequestSchema } from '../schemas/chat.js';
import { ChatService } from '../services/chat_service.js';

const router: Router = Router();
const chatService = new ChatService();

/** 列表类接口共用的 limit 查询参数。 */
const limitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** 将 Zod 错误转成接近 FastAPI 的 detail 结构。 */
function zodDetail(error: ZodError, loc: string, input: unknown) {
  return {
    detail: error.issues.map((issue) => ({
      type: issue.code,
      loc: [loc, ...issue.path],
      msg: issue.message,
      input,
    })),
  };
}

/**
 * POST /chat
 * 同步问答接口：等待完整回答后一次性返回 JSON。
 */
router.post('/', async (req, res, next) => {
  try {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(zodDetail(parsed.error, 'body', req.body));
      return;
    }

    try {
      const result = await chatService.invoke({
        sessionId: parsed.data.session_id,
        message: parsed.data.message,
        topK: parsed.data.top_k,
      });
      res.json(result);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Agent 对话执行失败')) {
        res.status(500).json({ detail: error.message });
        return;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /chat/stream
 * SSE 流式问答接口。
 *
 * 事件类型由 ChatService 产出，常见含义：
 * - status：阶段进度（started / retrieved 等）
 * - sources：溯源片段
 * - token：回答文本增量
 * - tool_call / tool_result / tool_error：工具调用过程
 * - error / done：失败或正常结束
 */
router.post('/stream', async (req, res, next) => {
  try {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(zodDetail(parsed.error, 'body', req.body));
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    for await (const event of chatService.stream({
      sessionId: parsed.data.session_id,
      message: parsed.data.message,
      topK: parsed.data.top_k,
    })) {
      res.write(event);
    }
    res.end();
  } catch (error) {
    if (res.headersSent) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: error instanceof Error ? error.message : String(error) })}\n\n`);
      res.end();
      return;
    }
    next(error);
  }
});

/**
 * GET /chat/sessions
 * 返回最近会话列表。
 */
router.get('/sessions', async (req, res, next) => {
  try {
    const parsed = limitQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(422).json(zodDetail(parsed.error, 'query', req.query));
      return;
    }
    const sessions = await chatService.listSessions({ limit: parsed.data.limit });
    res.json(sessions);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /chat/sessions/:session_id/history
 * 返回指定会话的问答历史。
 */
router.get('/sessions/:session_id/history', async (req, res, next) => {
  try {
    const parsed = limitQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(422).json(zodDetail(parsed.error, 'query', req.query));
      return;
    }
    const history = await chatService.getSessionHistory(req.params.session_id, { limit: parsed.data.limit });
    res.json(history);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /chat/sessions/:session_id
 * 清空指定会话的查询日志与短期记忆。
 */
router.delete('/sessions/:session_id', async (req, res, next) => {
  try {
    const result = await chatService.clearSession(req.params.session_id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
