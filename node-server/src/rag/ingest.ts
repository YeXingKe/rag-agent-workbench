/**
 * 文档入库（ingest）流水线。
 *
 * RAG 写入路径：LoadedDocument → 选 splitter 切 chunk → 写 Postgres →
 * 向量化写入 Milvus → 更新文档状态。也支持纯文本入库与重建。
 */

import path from 'node:path';

import type { Queryable } from '../core/postgres.js';
import { getVectorStore } from '../core/milvus.js';
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
 * 核心入库流程。
 *
 * 1. 创建或更新 Document 行；
 * 2. 逐 section 选 splitter 切分；
 * 3. 批量插入 Chunk；
 * 4. 写入向量并回填 vector_id；
 * 5. 更新文档 chunk_count / status。
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
  const loadedDocument = options.loadedDocument;
  const knowledgeBase = options.knowledgeBase ?? 'default';
  const sourcePath = options.sourcePath ?? null;
  const fileSize = options.fileSize ?? null;
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

  let document: DocumentRow;
  if (!options.existingDocument) {
    document = await insertDocument(db, {
      knowledge_base: knowledgeBase,
      filename: loadedDocument.filename,
      file_type: inferFileType(loadedDocument.filename),
      source_path: sourcePath,
      file_size: fileSize,
      status: 'uploaded',
      summary: `parser=${loadedDocument.parser_name}`,
    });
  } else {
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

  const chunkInputs = [];
  let globalChunkIndex = 0;
  const sectionSplitterSummary: Array<Record<string, unknown>> = [];

  for (const [sectionPositionZero, section] of loadedDocument.sections.entries()) {
    const sectionPosition = sectionPositionZero + 1;
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

    for (const splitChunk of splitChunks) {
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
        token_count: estimateTokenCount(splitChunk.content),
        page_number: pageNumberRaw == null ? null : Number(pageNumberRaw),
        start_offset: splitChunk.start_offset,
        end_offset: splitChunk.end_offset,
      });
      globalChunkIndex += 1;
    }
  }

  const chunkModels = await insertChunks(db, chunkInputs);

  if (chunkModels.length > 0) {
    const vectorStore = getVectorStore();
    const texts = chunkModels.map((chunk) => chunk.content);
    const metadatas = chunkModels.map((chunk) => {
      const metadata = { ...chunk.metadata_json };
      metadata.chunk_id = chunk.id;
      return metadata;
    });
    const vectorIds = await vectorStore.addTexts(texts, metadatas);
    const pairCount = Math.min(chunkModels.length, vectorIds.length);
    for (let index = 0; index < pairCount; index += 1) {
      const chunk = chunkModels[index];
      const vectorId = String(vectorIds[index]);
      chunk.vector_id = vectorId;
      chunk.metadata_json = {
        ...chunk.metadata_json,
        chunk_id: chunk.id,
        vector_id: vectorId,
      };
      await updateChunkVector(db, chunk.id, vectorId, chunk.metadata_json);
    }
  }

  document.chunk_count = chunkModels.length;
  document.status = chunkModels.length > 0 ? 'indexed' : 'parsed';
  document.summary = `parser=${loadedDocument.parser_name}; splitter=${preferredSplitter || 'auto'}`;
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
