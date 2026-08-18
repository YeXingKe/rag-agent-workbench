import { Router } from 'express';
import { ZodError } from 'zod';

import { withSession } from '../core/postgres.js';
import { retrievalSearchRequestSchema, toRetrievalHitItem } from '../schemas/retrieval.js';
import { RetrievalService } from '../services/retrieval_service.js';

const router: Router = Router();

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
