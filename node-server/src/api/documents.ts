/**
 * 文档 API 路由。
 *
 * 文本入库、文件上传、列表/详情、切分策略选项、按文档查 chunk、重建索引与删除。
 */

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
/** 内存暂存上传文件，大小上限取自配置 maxUploadSizeMb。 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: settings.maxUploadSizeMb * 1024 * 1024,
  },
});

/** 是否为客户端可预期的参数错误（应返回 400）。 */
function isClientValueError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error.message.startsWith('Unsupported splitter') || error.message === 'Document content cannot be empty')
  );
}

/** 将 Zod 错误转成接近 FastAPI 的 detail 结构。 */
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

/** 将 multer 内存文件落盘到 uploads 目录。 */
async function persistUpload(file: Express.Multer.File): Promise<{ storedPath: string; fileSize: number }> {
  const saved = await saveUploadFile(file);
  return { storedPath: saved.path, fileSize: saved.size };
}

/** 根据入库结果生成响应文案（含 Milvus 降级提示）。 */
function buildIngestMessage(document: { chunk_count: number; status: string }, uploaded = false): string {
  if (document.chunk_count > 0 && document.status === 'parsed') {
    return uploaded
      ? 'Document uploaded and parsed successfully (Milvus unavailable, vector index skipped).'
      : 'Document ingested successfully (Milvus unavailable, vector index skipped).';
  }
  if (document.chunk_count > 0) {
    return uploaded
      ? 'Document uploaded and ingested successfully'
      : 'Document ingested successfully';
  }
  return uploaded
    ? 'Document uploaded but no searchable chunks were produced'
    : 'Document ingested but no searchable chunks were produced';
}

/**
 * POST /documents/ingest-text
 * 通过纯文本快速创建文档并完成切分入库。
 */
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
      message: buildIngestMessage(document),
    });
  } catch (error) {
    if (isClientValueError(error)) {
      res.status(400).json({ detail: error.message });
      return;
    }
    next(error);
  }
});

/**
 * POST /documents/upload
 * 上传文件并完成解析、切分与向量入库（multipart：file / knowledge_base / preferred_splitter）。
 *
 * 中间件 upload.single('file')：由 multer 解析 multipart，把单个文件挂到 req.file（内存 buffer）。
 */
router.post('/upload', upload.single('file'), async (req, res, next) => {
  // 记录本次已落盘路径；入库失败时用于回滚删除，避免垃圾文件残留
  let storedPath: string | null = null;
  try {
    // multer 未收到名为 file 的字段，或未上传文件
    if (!req.file) {
      res.status(400).json({ detail: 'No filename provided' });
      return;
    }

    // 从表单字段读取知识库名；非字符串或空串则回退到 default
    const knowledgeBase = typeof req.body?.knowledge_base === 'string' && req.body.knowledge_base.trim()
      ? req.body.knowledge_base
      : 'default';
    // 可选切分策略原始值（structured / semi_structured / unstructured）
    const preferredSplitterRaw = req.body?.preferred_splitter;
    // 有有效字符串则 trim 后使用；否则 null，交由入库逻辑自动推断策略
    const preferredSplitter =
      typeof preferredSplitterRaw === 'string' && preferredSplitterRaw.trim()
        ? preferredSplitterRaw.trim()
        : null;

    // 将 multer 内存文件写入 storage/uploads，返回落盘路径与字节数
    const saved = await persistUpload(req.file);
    // 记下路径，供 catch 中失败清理使用
    storedPath = saved.storedPath;

    // 开启数据库会话，走完整 ingest：解析 → 切分 → 写 PG →（可选）写 Milvus
    // 事务 = 保证多步数据库操作「全成或全不成」，避免半成品数据。
    const document = await withSession(async (db) => {
      const service = new DocumentService(db);
      return service.ingestFile({
        // 本地已保存的源文件绝对路径
        filePath: saved.storedPath,
        // 展示/类型推断用原始文件名；缺失时退回存储路径
        originalFilename: req.file?.originalname || saved.storedPath,
        knowledgeBase,
        fileSize: saved.fileSize,
        preferredSplitter,
      });
    });

    // 入库成功：201 + 文档 DTO + 人类可读 message（含 Milvus 降级提示）
    res.status(201).json({
      document: toDocumentItem(document),
      message: buildIngestMessage(document, true),
    });
  } catch (error) {
    // 业务入库失败但文件已落盘：尝试删除半成品文件
    if (storedPath) {
      try {
        // 动态导入，避免顶层强依赖 fs/promises
        const { unlink } = await import('node:fs/promises');
        await unlink(storedPath);
      } catch {
        // 清理失败不影响主错误向上抛出/返回
        // ignore cleanup errors
      }
    }
    // 存储层错误（如超大小 413、无文件名 400）→ 按 StorageError 自带状态码响应
    if (error instanceof StorageError) {
      res.status(error.statusCode).json({ detail: error.message });
      return;
    }
    // 可预期的客户端参数错误（不支持的 splitter、空内容等）→ 400
    if (isClientValueError(error)) {
      res.status(400).json({ detail: error.message });
      return;
    }
    // 其余异常交给全局错误中间件
    next(error);
  }
});

/**
 * GET /documents
 * 返回文档列表。
 */
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

/**
 * GET /documents/splitters/options
 * 返回当前支持的切分策略列表。
 */
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

/**
 * GET /documents/:document_id
 * 返回单个文档详情。
 */
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

/**
 * DELETE /documents/:document_id
 * 删除文档及其 chunk / 向量 / 本地源文件；成功返回 204。
 */
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

/**
 * GET /documents/:document_id/chunks
 * 返回指定文档下的全部 chunk（上限 1000）。
 */
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

/**
 * POST /documents/:document_id/rebuild-index
 * 重建该文档的 chunk 与向量索引。
 */
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
