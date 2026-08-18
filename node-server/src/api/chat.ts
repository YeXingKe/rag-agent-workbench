import { Router } from 'express';
import { z, ZodError } from 'zod';

import { chatRequestSchema } from '../schemas/chat.js';
import { ChatService } from '../services/chat_service.js';

const router: Router = Router();
const chatService = new ChatService();

const limitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

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

router.delete('/sessions/:session_id', async (req, res, next) => {
  try {
    const result = await chatService.clearSession(req.params.session_id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
