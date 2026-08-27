/**
 * 文档入库（ingest）流水线。
 *
 * RAG 写入路径：LoadedDocument → 选 splitter 切 chunk → 写 Postgres →
 * （可选）向量化写入 Milvus → 更新文档状态。Milvus 不可用时降级为仅 Postgres + BM25。
 */

import path from 'node:path';

import type { Queryable } from '../core/postgres.js';
import { getVectorStore, checkMilvusReachable } from '../core/milvus.js';
import {
  deleteChunksByDocumentId,
  insertChunks,
  listChunksByDocumentId,
  updateChunkVector,
  type ChunkRow,
} from '../models/chunk.js';
import {
  insertDocument,
  saveDocument,
  type DocumentRow,
} from '../models/document.js';
import { createLogger } from '../utils/logger.js';
import { cleanText, estimateTokenCount } from '../utils/text.js';
import {
  buildLoadedDocumentFromText,
  loadDocument,
  type LoadedDocument,
} from './loader.js';
import { SPLITTER_REGISTRY, type SplitChunk } from './splitters/index.js';

const logger = createLogger('rag.ingest');

/**
 * 根据文件名推断文件类型。
 *
 * 第一版先用扩展名判断即可，后续可升级为更细粒度的 MIME 识别。
 */
function inferFileType(filename: string): string {
  const suffix = path.extname(filename).toLowerCase().replace(/^\./, '');
  return suffix || 'txt';
}

/**
 * 统一生成 chunk 元数据。
 *
 * 集中构造来源字段，供前端溯源、Agent 引用与检索调试复用。
 */
function buildChunkMetadata(input: {
  document: DocumentRow;
  knowledgeBase: string;
  parserName: string;
  sectionMetadata: Record<string, unknown>;
  chunkIndex: number;
  filename: string;
  splitterName: string;
}): Record<string, unknown> {
  return {
    chunk_id: null,
    document_id: input.document.id,
    knowledge_base: input.knowledgeBase,
    filename: input.filename,
    file_type: input.document.file_type,
    parser_name: input.parserName,
    chunk_index: input.chunkIndex,
    splitter_name: input.splitterName,
    source_path: input.document.source_path,
    ...input.sectionMetadata,
  };
}

/**
 * 推断切分策略名。
 *
 * 优先使用调用方指定；否则按 section_type / file_type 启发式选择。
 */
function inferSplitterName(input: {
  fileType: string;
  sectionMetadata: Record<string, unknown>;
  preferredSplitter?: string | null;
}): string {
  if (input.preferredSplitter && input.preferredSplitter in SPLITTER_REGISTRY) {
    return input.preferredSplitter;
  }

  const sectionType = String(input.sectionMetadata.section_type || '').toLowerCase();
  if (['pdf_page', 'markdown_heading', 'docx_heading_block'].includes(sectionType)) {
    return 'semi_structured';
  }
  if (['sql', 'ddl'].includes(input.fileType)) {
    return 'structured';
  }
  if (['table_schema', 'field_definition', 'config_block'].includes(sectionType)) {
    return 'structured';
  }
  return 'unstructured';
}

/** 对单个 section 执行切分，返回策略名与 chunk 列表。 */
function splitSection(input: {
  text: string;
  fileType: string;
  sectionMetadata: Record<string, unknown>;
  preferredSplitter?: string | null;
}): [string, SplitChunk[]] {
  const splitterName = inferSplitterName(input);
  const splitter = SPLITTER_REGISTRY[splitterName];
  return [splitterName, splitter(input.text)];
}

/**
 * 按 vector_id 从 Milvus 删除向量。
 * 删除失败不阻断后续重建流程。
 */
export async function deleteChunkVectors(chunks: ChunkRow[]): Promise<void> {
  const vectorIds = chunks.map((chunk) => chunk.vector_id).filter((id): id is string => Boolean(id));
  if (vectorIds.length === 0) {
    return;
  }

  const vectorStore = getVectorStore();
  try {
    await vectorStore.delete(vectorIds);
  } catch {
    // 向量删除失败不应阻断重建
  }
}

/**
 * 核心入库流程：把已解析的 LoadedDocument 写入 Postgres + Milvus。
 *
 * 调用链入口：
 * - ingestTextDocument（纯文本）
 * - ingestFileDocument（上传文件）
 * - rebuildDocumentChunks（重建索引，传入 existingDocument）
 *
 * 流水线步骤：
 * 1. 创建或更新 Document 行（status=uploaded）
 * 2. 逐 section 选 splitter 切成 chunk 候选
 * 3. 批量 insertChunks 写入 Postgres
 * 4. 向量化写入 Milvus，并回填 chunk.vector_id
 * 5. 更新文档 chunk_count / status（indexed 或 parsed）
 *
 * 注意：Postgres 事务由调用方 withSession 包裹；Milvus 写入不在同一事务内，
 * 向量失败时可能出现「PG 有 chunk、向量缺失」的中间态。
 *
 * @param db 可执行 query 的对象（Pool 或事务内的 PoolClient）
 * @param options.loadedDocument loader 产出的统一文档（filename / parser / sections）
 * @param options.knowledgeBase 知识库名，默认 default
 * @param options.sourcePath 本地源文件路径；纯文本入库时为 null
 * @param options.fileSize 文件字节数，便于管理页展示
 * @param options.preferredSplitter 强制切分策略；null 则按 section 启发式自动选
 * @param options.existingDocument 重建场景下复用已有文档行，避免新建 UUID
 * @returns 最终落库后的 Document 行（含 status / chunk_count / summary）
 */
export async function ingestLoadedDocument(
  db: Queryable,
  options: {
    loadedDocument: LoadedDocument;
    knowledgeBase?: string;
    sourcePath?: string | null;
    fileSize?: number | null;
    preferredSplitter?: string | null;
    existingDocument?: DocumentRow | null;
  },
): Promise<DocumentRow> {
  // ---------- 参数归一化 ----------
  const loadedDocument = options.loadedDocument;
  const knowledgeBase = options.knowledgeBase ?? 'default';
  const sourcePath = options.sourcePath ?? null;
  const fileSize = options.fileSize ?? null;
  // null = 自动推断；非空则优先使用用户指定策略
  const preferredSplitter = options.preferredSplitter ?? null;

  logger.info(
    '[INGEST] started: file=%s file_type=%s parser=%s sections=%s preferred_splitter=%s knowledge_base=%s source_path=%s',
    loadedDocument.filename,
    loadedDocument.file_type,
    loadedDocument.parser_name,
    loadedDocument.sections.length,
    preferredSplitter,
    knowledgeBase,
    sourcePath || '',
  );

  // ---------- 步骤 1：确保 Document 行存在 ----------
  // 首次入库 → insert；重建索引 → 更新已有行并重置为 uploaded
  let document: DocumentRow;
  if (!options.existingDocument) {
    document = await insertDocument(db, {
      knowledge_base: knowledgeBase,
      filename: loadedDocument.filename,
      // 以原始文件名扩展名推断类型（pdf/docx/md/txt…）
      file_type: inferFileType(loadedDocument.filename),
      source_path: sourcePath,
      file_size: fileSize,
      status: 'uploaded',
      summary: `parser=${loadedDocument.parser_name}`,
    });
  } else {
    // 重建路径：复用同一 document.id，避免前端引用失效
    document = options.existingDocument;
    document.knowledge_base = knowledgeBase;
    document.filename = loadedDocument.filename;
    document.file_type = inferFileType(loadedDocument.filename);
    document.source_path = sourcePath;
    document.file_size = fileSize;
    document.status = 'uploaded';
    document.summary = `parser=${loadedDocument.parser_name}`;
    document = await saveDocument(db, document);
  }

  // ---------- 步骤 2：按 section 切分，组装待插入的 chunk 列表 ----------
  // chunkInputs：尚未落库的插入载荷
  const chunkInputs = [];
  // 跨 section 的全局序号，保证同一文档内 chunk_index 连续唯一
  let globalChunkIndex = 0;
  // 记录每个 section 选用的 splitter，写入完成日志便于排查切分策略
  const sectionSplitterSummary: Array<Record<string, unknown>> = [];

  for (const [sectionPositionZero, section] of loadedDocument.sections.entries()) {
    // 日志用 1-based 编号，与人读习惯一致
    const sectionPosition = sectionPositionZero + 1;
    // 按 section 类型 / 文件类型 / 用户偏好选择 structured | semi_structured | unstructured
    const [splitterName, splitChunks] = splitSection({
      text: section.text,
      fileType: document.file_type,
      sectionMetadata: section.metadata,
      preferredSplitter,
    });
    sectionSplitterSummary.push({
      section_no: sectionPosition,
      section_type: section.metadata.section_type,
      section_title: section.metadata.section_title,
      page_number: section.metadata.page_number,
      splitter: splitterName,
      chunk_count: splitChunks.length,
      ocr_used: section.metadata.ocr_used ?? false,
    });
    logger.info(
      '[SPLITTER] selected: file=%s section_no=%s section_type=%s section_title=%j page_number=%s splitter=%s chunk_count=%s ocr_used=%s',
      loadedDocument.filename,
      sectionPosition,
      section.metadata.section_type,
      section.metadata.section_title,
      section.metadata.page_number,
      splitterName,
      splitChunks.length,
      section.metadata.ocr_used ?? false,
    );

    // 将本 section 切出的每个片段转成 Postgres chunk 插入行
    for (const splitChunk of splitChunks) {
      // 溯源元数据：document_id、页码、splitter、parser 等，供检索命中后展示来源
      const metadata = buildChunkMetadata({
        document,
        knowledgeBase,
        parserName: loadedDocument.parser_name,
        sectionMetadata: section.metadata,
        chunkIndex: globalChunkIndex,
        filename: loadedDocument.filename,
        splitterName,
      });
      const pageNumberRaw = section.metadata.page_number;
      chunkInputs.push({
        document_id: document.id,
        chunk_index: globalChunkIndex,
        content: splitChunk.content,
        metadata_json: metadata,
        // 粗估 token，便于后续截断 / 计费 / 展示
        token_count: estimateTokenCount(splitChunk.content),
        page_number: pageNumberRaw == null ? null : Number(pageNumberRaw),
        // 相对原 section 文本的字符偏移，便于高亮定位
        start_offset: splitChunk.start_offset,
        end_offset: splitChunk.end_offset,
      });
      globalChunkIndex += 1;
    }
  }

  // ---------- 步骤 3：批量写入 Postgres chunk 表 ----------
  const chunkModels = await insertChunks(db, chunkInputs);

  // ---------- 步骤 4：向量化并回填 vector_id ----------
  // 有 chunk 才写 Milvus；Milvus 不可用时降级为仅保留 Postgres + BM25
  let vectorsIndexed = false;
  if (chunkModels.length > 0) {
    const milvusReady = await checkMilvusReachable();
    if (!milvusReady) {
      logger.warn(
        '[INGEST] Milvus unavailable; skipping vector indexing for document_id=%s file=%s',
        document.id,
        loadedDocument.filename,
      );
    } else {
      try {
        const vectorStore = getVectorStore();
        const texts = chunkModels.map((chunk) => chunk.content);
        // 写入向量时补上真实 chunk_id（插入前 metadata 里为 null）
        const metadatas = chunkModels.map((chunk) => {
          const metadata = { ...chunk.metadata_json };
          metadata.chunk_id = chunk.id;
          return metadata;
        });
        // 批量 embedding + 写入向量库，返回与 texts 对齐的 vector id 列表
        const vectorIds = await vectorStore.addTexts(texts, metadatas);
        // 防御性取交集长度，避免两侧数量不一致时越界
        const pairCount = Math.min(chunkModels.length, vectorIds.length);
        for (let index = 0; index < pairCount; index += 1) {
          const chunk = chunkModels[index];
          const vectorId = String(vectorIds[index]);
          chunk.vector_id = vectorId;
          // 同步把 vector_id / chunk_id 写入 metadata_json，检索侧可直接读元数据
          chunk.metadata_json = {
            ...chunk.metadata_json,
            chunk_id: chunk.id,
            vector_id: vectorId,
          };
          await updateChunkVector(db, chunk.id, vectorId, chunk.metadata_json);
        }
        vectorsIndexed = pairCount > 0;
      } catch (error) {
        logger.warn(
          '[INGEST] Milvus vector indexing failed; continuing with Postgres-only chunks: document_id=%s error=%s',
          document.id,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  // ---------- 步骤 5：回写文档统计与终态 ----------
  document.chunk_count = chunkModels.length;
  // indexed：已向量化；parsed：仅有 chunk（Milvus 不可用或向量写入失败）
  document.status = chunkModels.length > 0 && vectorsIndexed ? 'indexed' : 'parsed';
  const milvusNote = chunkModels.length > 0 && !vectorsIndexed ? '; milvus=skipped' : '';
  document.summary = `parser=${loadedDocument.parser_name}; splitter=${preferredSplitter || 'auto'}${milvusNote}`;
  document = await saveDocument(db, document);

  logger.info(
    '[INGEST] completed: document_id=%s file=%s parser=%s chunk_count=%s status=%s split_summary=%j',
    document.id,
    loadedDocument.filename,
    loadedDocument.parser_name,
    chunkModels.length,
    document.status,
    sectionSplitterSummary,
  );
  return document;
}

/** 纯文本内容入库（无上传文件时）。 */
export async function ingestTextDocument(
  db: Queryable,
  options: {
    filename: string;
    content: string;
    knowledgeBase?: string;
    preferredSplitter?: string | null;
  },
): Promise<DocumentRow> {
  const cleanedContent = cleanText(options.content);
  if (!cleanedContent) {
    throw new Error('Document content cannot be empty');
  }
  const loadedDocument = buildLoadedDocumentFromText(options.filename, cleanedContent);
  return ingestLoadedDocument(db, {
    loadedDocument,
    knowledgeBase: options.knowledgeBase ?? 'default',
    fileSize: Buffer.byteLength(cleanedContent, 'utf8'),
    preferredSplitter: options.preferredSplitter,
  });
}

/** 从本地文件路径加载并入库。 */
export async function ingestFileDocument(
  db: Queryable,
  options: {
    filePath: string;
    originalFilename: string;
    knowledgeBase?: string;
    fileSize?: number | null;
    preferredSplitter?: string | null;
  },
): Promise<DocumentRow> {
  const loadedDocument = await loadDocument(options.filePath);
  loadedDocument.filename = options.originalFilename;
  return ingestLoadedDocument(db, {
    loadedDocument,
    knowledgeBase: options.knowledgeBase ?? 'default',
    sourcePath: options.filePath,
    fileSize: options.fileSize,
    preferredSplitter: options.preferredSplitter,
  });
}

/**
 * 重建文档的 chunk 与向量。
 *
 * 先删旧向量与旧 chunk，再按 source_path 重新加载；
 * 无源文件时用现有 chunk 文本拼接回退。
 */
export async function rebuildDocumentChunks(
  db: Queryable,
  options: {
    document: DocumentRow;
    preferredSplitter?: string | null;
  },
): Promise<DocumentRow> {
  const existingChunks = await listChunksByDocumentId(db, options.document.id);
  await deleteChunkVectors(existingChunks);
  await deleteChunksByDocumentId(db, options.document.id);

  let loadedDocument: LoadedDocument;
  let documentFileSize = options.document.file_size;
  if (options.document.source_path) {
    loadedDocument = await loadDocument(options.document.source_path);
    loadedDocument.filename = options.document.filename;
    documentFileSize = options.document.file_size;
  } else {
    const fullText = existingChunks
      .slice()
      .sort((left, right) => left.chunk_index - right.chunk_index)
      .map((chunk) => chunk.content)
      .join('\n\n');
    loadedDocument = buildLoadedDocumentFromText(options.document.filename, fullText);
    documentFileSize = Buffer.byteLength(fullText, 'utf8');
  }

  return ingestLoadedDocument(db, {
    loadedDocument,
    knowledgeBase: options.document.knowledge_base,
    sourcePath: options.document.source_path,
    fileSize: documentFileSize,
    preferredSplitter: options.preferredSplitter,
    existingDocument: options.document,
  });
}
