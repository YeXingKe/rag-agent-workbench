import { unlink } from 'node:fs/promises';

import type { Queryable } from '../core/postgres.js';
import { deleteDocumentById, getDocumentById, listDocuments, type DocumentRow } from '../models/document.js';
import { deleteChunksByDocumentId, listChunksByDocumentId } from '../models/chunk.js';
import {
  deleteChunkVectors,
  ingestFileDocument,
  ingestTextDocument,
  rebuildDocumentChunks,
} from '../rag/ingest.js';
import { getBm25Index } from '../rag/bm25_index.js';
import { SPLITTER_REGISTRY } from '../rag/splitters/index.js';
import { logger } from '../utils/logger.js';

export class DocumentService {
  constructor(private readonly db: Queryable) {}

  private validateSplitterName(preferredSplitter: string | null | undefined): void {
    if (preferredSplitter != null && !(preferredSplitter in SPLITTER_REGISTRY)) {
      const availableNames = Object.keys(SPLITTER_REGISTRY).join(', ');
      throw new Error(`Unsupported splitter: ${preferredSplitter}. Available: ${availableNames}`);
    }
  }

  async ingestText(params: {
    filename: string;
    content: string;
    knowledgeBase?: string;
    preferredSplitter?: string | null;
  }): Promise<DocumentRow> {
    const knowledgeBase = params.knowledgeBase ?? 'default';
    const preferredSplitter = params.preferredSplitter ?? null;
    this.validateSplitterName(preferredSplitter);
    logger.info(
      '[DOC] ingest_text: filename=%s knowledge_base=%s preferred_splitter=%s content_chars=%s',
      params.filename,
      knowledgeBase,
      preferredSplitter ?? 'auto',
      params.content.length,
    );

    const document = await ingestTextDocument(this.db, {
      filename: params.filename,
      content: params.content,
      knowledgeBase,
      preferredSplitter,
    });

    getBm25Index().markDirty(`document_ingested:${document.id}`);
    logger.info(
      '[DOC] ingest_text done: document_id=%s filename=%s status=%s chunk_count=%s summary=%s',
      document.id,
      document.filename,
      document.status,
      document.chunk_count,
      document.summary,
    );
    return document;
  }

  async ingestFile(params: {
    filePath: string;
    originalFilename: string;
    knowledgeBase?: string;
    fileSize?: number | null;
    preferredSplitter?: string | null;
  }): Promise<DocumentRow> {
    const knowledgeBase = params.knowledgeBase ?? 'default';
    const preferredSplitter = params.preferredSplitter ?? null;
    this.validateSplitterName(preferredSplitter);
    logger.info(
      '[DOC] ingest_file: original_filename=%s file_path=%s knowledge_base=%s file_size=%s preferred_splitter=%s',
      params.originalFilename,
      params.filePath,
      knowledgeBase,
      params.fileSize,
      preferredSplitter ?? 'auto',
    );

    const document = await ingestFileDocument(this.db, {
      filePath: params.filePath,
      originalFilename: params.originalFilename,
      knowledgeBase,
      fileSize: params.fileSize,
      preferredSplitter,
    });

    getBm25Index().markDirty(`document_ingested:${document.id}`);
    logger.info(
      '[DOC] ingest_file done: document_id=%s filename=%s status=%s chunk_count=%s summary=%s',
      document.id,
      document.filename,
      document.status,
      document.chunk_count,
      document.summary,
    );
    return document;
  }

  async listDocuments(): Promise<DocumentRow[]> {
    return listDocuments(this.db);
  }

  async getDocument(documentId: string): Promise<DocumentRow | null> {
    return getDocumentById(this.db, documentId);
  }

  async rebuildIndex(
    documentId: string,
    params: { preferredSplitter?: string | null } = {},
  ): Promise<DocumentRow | null> {
    const preferredSplitter = params.preferredSplitter ?? null;
    this.validateSplitterName(preferredSplitter);
    logger.info(
      '[DOC] rebuild_index: document_id=%s preferred_splitter=%s',
      documentId,
      preferredSplitter ?? 'auto',
    );

    const document = await this.getDocument(documentId);
    if (document == null) {
      return null;
    }

    const rebuiltDocument = await rebuildDocumentChunks(this.db, {
      document,
      preferredSplitter,
    });
    getBm25Index().markDirty(`document_rebuilt:${rebuiltDocument.id}`);
    logger.info(
      '[DOC] rebuild_index done: document_id=%s filename=%s status=%s chunk_count=%s summary=%s',
      rebuiltDocument.id,
      rebuiltDocument.filename,
      rebuiltDocument.status,
      rebuiltDocument.chunk_count,
      rebuiltDocument.summary,
    );
    return rebuiltDocument;
  }

  listSplitterOptions(): Array<{ name: string; description: string }> {
    const descriptions: Record<string, string> = {
      structured: '适合字段说明、配置项、DDL、参数列表等强结构化内容',
      semi_structured: '适合 Markdown、Docx 标题段落块、业务方案说明等半结构化内容',
      unstructured: '适合普通自然段文本，按长度与分隔符做基础切分',
    };
    return Object.keys(SPLITTER_REGISTRY).map((name) => ({
      name,
      description: descriptions[name] ?? '',
    }));
  }

  async deleteDocument(documentId: string): Promise<boolean> {
    const document = await this.getDocument(documentId);
    if (document == null) {
      return false;
    }

    const chunks = await listChunksByDocumentId(this.db, document.id);
    if (chunks.length > 0) {
      await deleteChunkVectors(chunks);
      await deleteChunksByDocumentId(this.db, document.id);
    }

    if (document.source_path) {
      try {
        await unlink(document.source_path);
      } catch (error) {
        logger.warn('Failed to delete physical file %s: %s', document.source_path, error);
      }
    }

    await deleteDocumentById(this.db, documentId);
    getBm25Index().markDirty(`document_deleted:${documentId}`);
    logger.info('[DOC] delete_document done: document_id=%s', documentId);
    return true;
  }
}
