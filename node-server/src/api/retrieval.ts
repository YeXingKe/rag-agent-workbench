/**
 * 检索调试 API。
 *
 * 直接调用 RetrievalService，便于前端或联调时验证混合检索效果，
 * 不经过 Agent 对话链路。
 */

import { Router } from 'express';
import { ZodError } from 'zod';

import { withSession } from '../core/postgres.js';
import { retrievalSearchRequestSchema, toRetrievalHitItem } from '../schemas/retrieval.js';
import { RetrievalService } from '../services/retrieval_service.js';

const router: Router = Router();

/** 将 Zod 校验错误转成接近 FastAPI 风格的 detail 结构。 */
function zodDetail(error: ZodError, input: unknown) {
  return {
    detail: error.issues.map((issue) => ({
      type: issue.code,
      loc: ['body', ...issue.path],
      msg: issue.message,
      input,
    })),
  };
}

/**
 * POST /retrieval/search
 * 按 query / top_k 检索知识库，返回命中片段列表。
 */
router.post('/search', async (req, res, next) => {
  try {
    const parsed = retrievalSearchRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(zodDetail(parsed.error, req.body));
      return;
    }

    const items = await withSession(async (db) => {
      const service = new RetrievalService(db);
      return service.search({ query: parsed.data.query, topK: parsed.data.top_k });
    });

    res.json({
      items: items.map((item) => toRetrievalHitItem(item)),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
