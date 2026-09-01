/**
 * 文档业务服务。
 *
 * 编排文档入库、列表、详情、重建索引与删除；
 * 切分/向量写入细节委托给 rag/ingest，BM25 脏标记在入库变更后触发。
 */

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

/** 文档相关业务编排。 */
export class DocumentService {
  constructor(private readonly db: Queryable) { }

  /** 校验用户显式指定的切分策略是否合法。 */
  private validateSplitterName(preferredSplitter: string | null | undefined): void {
    if (preferredSplitter != null && !(preferredSplitter in SPLITTER_REGISTRY)) {
      const availableNames = Object.keys(SPLITTER_REGISTRY).join(', ');
      throw new Error(`Unsupported splitter: ${preferredSplitter}. Available: ${availableNames}`);
    }
  }

  /**
   * 通过纯文本写入文档、切分 chunk，并同步建立向量索引。
   *
   * 编排职责（本方法不直接碰 Postgres/Milvus 细节）：
   * 1. 归一化 knowledgeBase / preferredSplitter
   * 2. 校验切分策略名是否在 SPLITTER_REGISTRY 中
   * 3. 委托 rag/ingest.ingestTextDocument 完成清洗 → LoadedDocument → 入库
   * 4. 标记 BM25 索引脏，触发后续词法检索重建
   *
   * 典型调用：API POST /documents/ingest-text，外层用 withSession 包裹事务。
   *
   * @param params.filename 展示用文件名（也用于类型推断，如 .md / .txt）
   * @param params.content 文档正文（空内容会在 ingestTextDocument 内抛错）
   * @param params.knowledgeBase 目标知识库，默认 default
   * @param params.preferredSplitter 可选切分策略名；null/undefined 表示自动推断
   * @returns 入库后的 Document 行（含 status / chunk_count / summary）
   */
  async ingestText(params: {
    filename: string;
    content: string;
    knowledgeBase?: string;
    preferredSplitter?: string | null;
  }): Promise<DocumentRow> {
    // 未指定知识库时落入默认库，便于多库隔离前的兼容行为
    const knowledgeBase = params.knowledgeBase ?? 'default';
    // null = 由 ingest 流水线按 section/file_type 自动选 splitter
    const preferredSplitter = params.preferredSplitter ?? null;
    // 非法策略名尽早失败，避免进入昂贵的切分/向量化流程
    this.validateSplitterName(preferredSplitter);
    logger.info(
      '[DOC] ingest_text: filename=%s knowledge_base=%s preferred_splitter=%s content_chars=%s',
      params.filename,
      knowledgeBase,
      preferredSplitter ?? 'auto',
      params.content.length,
    );

    // 核心入库：cleanText → buildLoadedDocumentFromText → ingestLoadedDocument
    // this.db 通常是 withSession 借出的事务连接，保证 document/chunk 原子写入
    const document = await ingestTextDocument(this.db, {
      filename: params.filename,
      content: params.content,
      knowledgeBase,
      preferredSplitter,
    });

    // 文档内容变更后，内存 BM25 索引失效；markDirty 供下次检索前懒重建
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

  /**
   * 从已保存的本地文件创建文档并完成解析、切分与向量入库。
   *
   * 编排职责（本方法不直接碰解析/切分细节）：
   * 1. 归一化 knowledgeBase / preferredSplitter
   * 2. 校验切分策略名是否在 SPLITTER_REGISTRY 中
   * 3. 委托 rag/ingest.ingestFileDocument：loadDocument → 切分 → 写 PG →（可选）写 Milvus
   * 4. 标记 BM25 索引脏，触发后续词法检索重建
   *
   * 典型调用：API POST /documents/upload 在 persistUpload 落盘后，外层用 withSession 包裹事务。
   *
   * @param params.filePath 本地已保存的源文件绝对路径（如 storage/uploads/...）
   * @param params.originalFilename 原始上传文件名（展示与扩展名推断）
   * @param params.knowledgeBase 目标知识库，默认 default
   * @param params.fileSize 文件字节数（可选，写入 document.file_size）
   * @param params.preferredSplitter 可选切分策略名；null/undefined 表示自动推断
   * @returns 入库后的 Document 行（含 status / chunk_count / summary）
   */
  async ingestFile(params: {
    filePath: string;
    originalFilename: string;
    knowledgeBase?: string;
    fileSize?: number | null;
    preferredSplitter?: string | null;
  }): Promise<DocumentRow> {
    // 未指定知识库时落入默认库
    const knowledgeBase = params.knowledgeBase ?? 'default';
    // null = 由 ingest 流水线按 section/file_type 自动选 splitter
    const preferredSplitter = params.preferredSplitter ?? null;
    // 非法策略名尽早失败，避免进入昂贵的解析/切分/向量化流程
    this.validateSplitterName(preferredSplitter);
    // 记录入库入参，便于排查「传了哪个文件、哪个库、哪种切分」
    logger.info(
      '[DOC] ingest_file: original_filename=%s file_path=%s knowledge_base=%s file_size=%s preferred_splitter=%s',
      params.originalFilename,
      params.filePath,
      knowledgeBase,
      params.fileSize,
      preferredSplitter ?? 'auto',
    );

    // 核心入库：按路径加载文件 → LoadedDocument → ingestLoadedDocument
    // this.db 通常是 withSession 借出的事务连接，保证 document/chunk 原子写入
    const document = await ingestFileDocument(this.db, {
      filePath: params.filePath,
      originalFilename: params.originalFilename,
      knowledgeBase,
      fileSize: params.fileSize,
      preferredSplitter,
    });

    // 文档内容变更后，内存 BM25 索引失效；markDirty 供下次检索前懒重建
    getBm25Index().markDirty(`document_ingested:${document.id}`);
    // 记录结果摘要：状态、chunk 数、summary（可能含 milvus=skipped）
    logger.info(
      '[DOC] ingest_file done: document_id=%s filename=%s status=%s chunk_count=%s summary=%s',
      document.id,
      document.filename,
      document.status,
      document.chunk_count,
      document.summary,
    );
    // 返回 Document 行，供 API 层 toDocumentItem 序列化给前端
    return document;
  }

  /** 返回文档列表。 */
  async listDocuments(): Promise<DocumentRow[]> {
    return listDocuments(this.db);
  }

  /** 按 ID 获取文档详情；不存在返回 null。 */
  async getDocument(documentId: string): Promise<DocumentRow | null> {
    return getDocumentById(this.db, documentId);
  }

  /**
   * 重建指定文档的 chunk 与向量索引。
   * 可强制指定 preferredSplitter；不传则由入库逻辑自动判断。
   */
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

  /** 返回当前支持的切分策略列表及中文说明。 */
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

  /**
   * 删除文档：清理向量与 chunk、尝试删除本地源文件，再删文档行。
   * @returns 是否删除成功（文档不存在时为 false）
   */
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
