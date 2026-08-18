import { Router } from 'express';
import { z, ZodError } from 'zod';

import { withSession } from '../core/postgres.js';
import { chunkUpdateRequestSchema, toChunkItem } from '../schemas/chunk.js';
import { ChunkService } from '../services/chunk_service.js';

const router: Router = Router();

const listQuerySchema = z.object({
  document_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
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
