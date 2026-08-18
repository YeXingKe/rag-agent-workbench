import { Router } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';

import { withSession } from '../core/postgres.js';
import { getSettings } from '../config/settings.js';
import { toChunkItem } from '../schemas/chunk.js';
import {
  documentCreateRequestSchema,
  documentRebuildRequestSchema,
  toDocumentItem,
} from '../schemas/document.js';
import { ChunkService } from '../services/chunk_service.js';
import { DocumentService } from '../services/document_service.js';
import { saveUploadFile, StorageError } from '../utils/storage.js';

const router: Router = Router();
const settings = getSettings();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: settings.maxUploadSizeMb * 1024 * 1024,
  },
});

function isClientValueError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error.message.startsWith('Unsupported splitter') || error.message === 'Document content cannot be empty')
  );
}

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

async function persistUpload(file: Express.Multer.File): Promise<{ storedPath: string; fileSize: number }> {
  const saved = await saveUploadFile(file);
  return { storedPath: saved.path, fileSize: saved.size };
}

router.post('/ingest-text', async (req, res, next) => {
  try {
    const parsed = documentCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(zodDetail(parsed.error, req.body));
      return;
    }

    const document = await withSession(async (db) => {
      const service = new DocumentService(db);
      return service.ingestText({
        filename: parsed.data.filename,
        content: parsed.data.content,
        knowledgeBase: parsed.data.knowledge_base,
        preferredSplitter: parsed.data.preferred_splitter,
      });
    });

    res.status(201).json({
      document: toDocumentItem(document),
      message: 'Document ingested successfully',
    });
  } catch (error) {
    if (isClientValueError(error)) {
      res.status(400).json({ detail: error.message });
      return;
    }
    next(error);
  }
});

router.post('/upload', upload.single('file'), async (req, res, next) => {
  let storedPath: string | null = null;
  try {
    if (!req.file) {
      res.status(400).json({ detail: 'No filename provided' });
      return;
    }

    const knowledgeBase = typeof req.body?.knowledge_base === 'string' && req.body.knowledge_base.trim()
      ? req.body.knowledge_base
      : 'default';
    const preferredSplitterRaw = req.body?.preferred_splitter;
    const preferredSplitter =
      typeof preferredSplitterRaw === 'string' && preferredSplitterRaw.trim()
        ? preferredSplitterRaw.trim()
        : null;

    const saved = await persistUpload(req.file);
    storedPath = saved.storedPath;

    const document = await withSession(async (db) => {
      const service = new DocumentService(db);
      return service.ingestFile({
        filePath: saved.storedPath,
        originalFilename: req.file?.originalname || saved.storedPath,
        knowledgeBase,
        fileSize: saved.fileSize,
        preferredSplitter,
      });
    });

    res.status(201).json({
      document: toDocumentItem(document),
      message: 'Document uploaded and ingested successfully',
    });
  } catch (error) {
    if (storedPath) {
      try {
        const { unlink } = await import('node:fs/promises');
        await unlink(storedPath);
      } catch {
        // ignore cleanup errors
      }
    }
    if (error instanceof StorageError) {
      res.status(error.statusCode).json({ detail: error.message });
      return;
    }
    if (isClientValueError(error)) {
      res.status(400).json({ detail: error.message });
      return;
    }
    next(error);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const documents = await withSession(async (db) => {
      const service = new DocumentService(db);
      return service.listDocuments();
    });
    res.json(documents.map((document) => toDocumentItem(document)));
  } catch (error) {
    next(error);
  }
});

router.get('/splitters/options', async (_req, res, next) => {
  try {
    const options = await withSession(async (db) => {
      const service = new DocumentService(db);
      return service.listSplitterOptions();
    });
    res.json(options);
  } catch (error) {
    next(error);
  }
});

router.get('/:document_id', async (req, res, next) => {
  try {
    const document = await withSession(async (db) => {
      const service = new DocumentService(db);
      return service.getDocument(req.params.document_id);
    });
    if (document == null) {
      res.status(404).json({ detail: 'Document not found' });
      return;
    }
    res.json(toDocumentItem(document));
  } catch (error) {
    next(error);
  }
});

router.delete('/:document_id', async (req, res, next) => {
  try {
    const deleted = await withSession(async (db) => {
      const service = new DocumentService(db);
      return service.deleteDocument(req.params.document_id);
    });
    if (!deleted) {
      res.status(404).json({ detail: 'Document not found' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/:document_id/chunks', async (req, res, next) => {
  try {
    const chunks = await withSession(async (db) => {
      const documentService = new DocumentService(db);
      if ((await documentService.getDocument(req.params.document_id)) == null) {
        return null;
      }
      const chunkService = new ChunkService(db);
      return chunkService.listChunks({ documentId: req.params.document_id, limit: 1000 });
    });
    if (chunks == null) {
      res.status(404).json({ detail: 'Document not found' });
      return;
    }
    res.json(chunks.map((chunk) => toChunkItem(chunk)));
  } catch (error) {
    next(error);
  }
});

router.post('/:document_id/rebuild-index', async (req, res, next) => { // FastAPI: POST /documents/{id}/rebuild-index
  try {
    const parsed = documentRebuildRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(422).json(zodDetail(parsed.error, req.body ?? {}));
      return;
    }

    const document = await withSession(async (db) => {
      const service = new DocumentService(db);
      return service.rebuildIndex(req.params.document_id, {
        preferredSplitter: parsed.data.preferred_splitter,
      });
    });
    if (document == null) {
      res.status(404).json({ detail: 'Document not found' });
      return;
    }
    res.json({
      document: toDocumentItem(document),
      message: 'Document chunks and vector index rebuilt successfully',
    });
  } catch (error) {
    if (isClientValueError(error)) {
      res.status(400).json({ detail: error.message });
      return;
    }
    next(error);
  }
});

export default router;
