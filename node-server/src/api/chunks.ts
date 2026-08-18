/**
 * Chunk API 路由。
 *
 * 提供片段列表、详情、删除与人工编辑接口；业务逻辑委托 ChunkService。
 */

import { Router } from 'express';
import { z, ZodError } from 'zod';

import { withSession } from '../core/postgres.js';
import { chunkUpdateRequestSchema, toChunkItem } from '../schemas/chunk.js';
import { ChunkService } from '../services/chunk_service.js';

const router: Router = Router();

/** 列表查询参数：可选按文档过滤，limit 默认 100。 */
const listQuerySchema = z.object({
  document_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
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
 * GET /chunks
 * 返回 chunk 列表；可按 document_id 过滤。
 */
router.get('/', async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(422).json(zodDetail(parsed.error, 'query', req.query));
      return;
    }

    const chunks = await withSession(async (db) => {
      const service = new ChunkService(db);
      return service.listChunks({
        documentId: parsed.data.document_id,
        limit: parsed.data.limit,
      });
    });
    res.json(chunks.map((chunk) => toChunkItem(chunk)));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /chunks/:chunk_id
 * 返回单个 chunk 详情。
 */
router.get('/:chunk_id', async (req, res, next) => {
  try {
    const chunk = await withSession(async (db) => {
      const service = new ChunkService(db);
      return service.getChunk(req.params.chunk_id);
    });
    if (chunk == null) {
      res.status(404).json({ detail: 'Chunk not found' });
      return;
    }
    res.json(toChunkItem(chunk));
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /chunks/:chunk_id
 * 删除 chunk（含向量与 BM25 脏标记）；成功返回 204。
 */
router.delete('/:chunk_id', async (req, res, next) => {
  try {
    const deleted = await withSession(async (db) => {
      const service = new ChunkService(db);
      return service.deleteChunk(req.params.chunk_id);
    });
    if (!deleted) {
      res.status(404).json({ detail: 'Chunk not found' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /chunks/:chunk_id
 * 编辑 chunk 正文 / 启用状态 / 元数据；正文变更会同步向量。
 */
router.patch('/:chunk_id', async (req, res, next) => {
  try {
    const parsed = chunkUpdateRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(422).json(zodDetail(parsed.error, 'body', req.body ?? {}));
      return;
    }

    const chunk = await withSession(async (db) => {
      const service = new ChunkService(db);
      return service.updateChunk(req.params.chunk_id, {
        content: parsed.data.content,
        enabled: parsed.data.enabled,
        metadataJson: parsed.data.metadata_json,
      });
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message === 'Chunk content cannot be empty') {
        res.status(400).json({ detail: error.message });
        return undefined;
      }
      throw error;
    });

    if (res.headersSent) {
      return;
    }
    if (chunk == null) {
      res.status(404).json({ detail: 'Chunk not found' });
      return;
    }
    res.json(toChunkItem(chunk));
  } catch (error) {
    next(error);
  }
});

export default router;
