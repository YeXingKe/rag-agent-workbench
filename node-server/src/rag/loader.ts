/**
 * 文档加载器。
 *
 * RAG 入库上游：按扩展名选择解析器，把磁盘文件 / 纯文本变成统一的 LoadedDocument（sections）。
 * 下游 ingestLoadedDocument 只认这种结构，不再关心 PDF / Word / Markdown 的差异。
 *
 * 解析策略：
 * - txt / md：读字节 → 探测编码 → 切 section
 * - pdf / docx：先 OCR 启发式；未命中或失败则回退原生解析
 * - 旧版 .doc：只走 OCR，未配置 OCR 则直接失败
 */

import fs from 'node:fs';
import path from 'node:path';

/** 探测文件编码（GBK / UTF-8 等），避免中文 txt 乱码 */
import chardet from 'chardet';
/** 按探测到的编码把 Buffer 解码成字符串 */
import iconv from 'iconv-lite';
/** 把 .docx 转成 HTML / 纯文本 */
import mammoth from 'mammoth';
import { OCRService, extractPdfPages, type OCRDetectionDecision } from '../services/ocr_service.js';
import { createLogger } from '../utils/logger.js';
import { cleanText } from '../utils/text.js';

const logger = createLogger('rag.loader');

/**
 * 解析后的一个逻辑片段（粗切，还不是最终 chunk）。
 *
 * 后续 ingest 会按 metadata.section_type 选 splitter，再把 text 切成可检索小段。
 * 常见 section_type：pdf_page / markdown_heading / docx_heading_block / full_text / inline_text。
 */
export interface LoadedSection {
  /** 该片段正文 */
  text: string;
  /**
   * 溯源与路由元数据，例如：
   * section_type、section_title、section_index、page_number、ocr_used
   */
  metadata: Record<string, unknown>;
}

/**
 * 加载器输出的统一文档结构。
 *
 * 一份文件 = 若干 sections；filename / file_type / parser_name 供入库写 document 行与日志排查。
 */
export class LoadedDocument {
  /** 展示用文件名（上传场景下可能被改成 originalFilename） */
  filename: string;
  /** 扩展名语义：txt / md / pdf / docx / doc */
  file_type: string;
  /** 实际解析器名，如 markdown_loader、pypdf_loader、ocr_markdown_loader */
  parser_name: string;
  /** 粗切后的逻辑片段列表 */
  sections: LoadedSection[];

  constructor(input: {
    filename: string;
    file_type: string;
    parser_name: string;
    sections: LoadedSection[];
  }) {
    this.filename = input.filename;
    this.file_type = input.file_type;
    this.parser_name = input.parser_name;
    this.sections = input.sections;
  }

  /** 把非空 section 拼成完整正文，供摘要 / 统计；入库主路径仍遍历 sections。 */
  get fullText(): string {
    return this.sections
      .filter((section) => section.text.trim())
      .map((section) => section.text)
      .join('\n\n');
  }
}

/** 探测文本文件编码，失败时默认 utf-8。 */
function detectTextEncoding(fileBytes: Buffer): string {
  const detected = chardet.detect(fileBytes);
  if (!detected) {
    return 'utf-8';
  }
  if (typeof detected === 'string') {
    return detected;
  }
  return 'utf-8';
}

/**
 * 按探测到的编码解码文件字节。
 * utf-8/ascii 走 Node 原生；其它编码（如 gbk）走 iconv-lite；未知编码再回退 utf-8。
 */
function decodeFileBytes(fileBytes: Buffer): string {
  const encoding = detectTextEncoding(fileBytes);
  const normalized = encoding.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized === 'utf8' || normalized === 'ascii') {
    return fileBytes.toString('utf8');
  }
  if (iconv.encodingExists(encoding)) {
    return iconv.decode(fileBytes, encoding);
  }
  return fileBytes.toString('utf8');
}

/** 纯文本：整篇作为一个 full_text section，不再按标题切。 */
async function loadTextFile(filePath: string): Promise<LoadedDocument> {
  const fileBytes = await fs.promises.readFile(filePath);
  const text = decodeFileBytes(fileBytes);
  const loadedDocument = new LoadedDocument({
    filename: path.basename(filePath),
    file_type: 'txt',
    parser_name: 'plain_text_loader',
    sections: [
      {
        text: cleanText(text),
        metadata: { section_type: 'full_text', section_index: 0 },
      },
    ],
  });
  logger.info(
    '[PARSER] selected: file=%s parser=NATIVE_%s sections=%s file_type=%s',
    path.basename(filePath),
    loadedDocument.parser_name.toUpperCase(),
    loadedDocument.sections.length,
    loadedDocument.file_type,
  );
  return loadedDocument;
}

/**
 * 按 Markdown 标题行（# …）切成多个 heading section。
 *
 * 遇到新的 # 标题就 flush 上一段；全文没有标题时退回单个 full_text。
 */
function splitMarkdownSections(text: string): LoadedSection[] {
  const lines = text.split('\n');
  const sections: LoadedSection[] = [];
  let currentTitle = 'Introduction';
  let currentLines: string[] = [];
  let sectionIndex = 0;

  /** 把当前累计行写成一个 markdown_heading section（空内容则跳过）。 */
  const flushCurrentSection = (): void => {
    const content = cleanText(currentLines.join('\n'));
    if (!content) {
      return;
    }
    sections.push({
      text: content,
      metadata: {
        section_type: 'markdown_heading',
        section_title: currentTitle,
        section_index: sectionIndex,
      },
    });
    sectionIndex += 1;
  };

  for (const line of lines) {
    if (line.trimStart().startsWith('#')) {
      flushCurrentSection();
      currentTitle = line.replace(/^\s*#+/, '').trim() || 'Untitled';
      currentLines = [line];
      continue;
    }
    currentLines.push(line);
  }

  flushCurrentSection();
  return sections.length > 0
    ? sections
    : [{ text: cleanText(text), metadata: { section_type: 'full_text', section_index: 0 } }];
}

/** Markdown 文件：解码后按标题切 section。 */
async function loadMarkdownFile(filePath: string): Promise<LoadedDocument> {
  const fileBytes = await fs.promises.readFile(filePath);
  const text = decodeFileBytes(fileBytes);
  const loadedDocument = new LoadedDocument({
    filename: path.basename(filePath),
    file_type: 'md',
    parser_name: 'markdown_loader',
    sections: splitMarkdownSections(text),
  });
  logger.info(
    '[PARSER] selected: file=%s parser=NATIVE_%s sections=%s file_type=%s',
    path.basename(filePath),
    loadedDocument.parser_name.toUpperCase(),
    loadedDocument.sections.length,
    loadedDocument.file_type,
  );
  return loadedDocument;
}

/**
 * 将 OCR 产出的 Markdown 转成 LoadedDocument。
 * 每个 section 附带 OCR 决策元数据，并标记 ocr_used=true，供切分策略与前端溯源。
 */
function buildOcrLoadedDocument(input: {
  filePath: string;
  fileType: string;
  markdownText: string;
  decision: OCRDetectionDecision;
}): LoadedDocument {
  const sections = splitMarkdownSections(input.markdownText);
  const decisionMetadata = input.decision.toMetadata();
  for (const section of sections) {
    let secType = section.metadata.section_type;
    // 无标题的 OCR 全文也标成 markdown_heading，后续更倾向走 semi_structured 切分
    if (secType === 'full_text') {
      secType = 'markdown_heading';
    }
    section.metadata = {
      ...section.metadata,
      ...decisionMetadata,
      section_type: secType || 'markdown_heading',
      ocr_used: true,
    };
  }

  return new LoadedDocument({
    filename: path.basename(input.filePath),
    file_type: input.fileType,
    parser_name: 'ocr_markdown_loader',
    sections,
  });
}

/**
 * 尝试走 OCR 路径。
 *
 * - 返回 LoadedDocument：已判定需要 OCR 且解析成功
 * - 返回 null：启发式认为不必 OCR，调用方应走原生解析
 * - 抛错：OCR 调用失败，由调用方决定是否降级原生解析
 */
async function tryLoadWithOcr(filePath: string, fileType: string): Promise<LoadedDocument | null> {
  const ocrService = new OCRService();
  const decision = await ocrService.analyzeDocument(filePath);
  if (!decision.shouldUseOcr) {
    logger.info(
      '[OCR] skipped: file=%s file_type=%s enabled=%s reasons=%j text_chars=%s images=%s tables=%s empty_blocks=%s total_blocks=%s',
      path.basename(filePath),
      fileType,
      ocrService.canUseOcr(),
      decision.reasons,
      decision.extractedTextChars,
      decision.imageCount,
      decision.tableCount,
      decision.emptyBlockCount,
      decision.totalBlockCount,
    );
    console.log('\n==================================================');
    console.log('👉 文档解析路线: 【原生解析】 (跳过 OCR)');
    console.log(`👉 文件名称: ${path.basename(filePath)}`);
    console.log('==================================================\n');
    logger.info('[PARSER] OCR routing rejected. Proceeding to use NATIVE parser for %s.', path.basename(filePath));
    return null;
  }

  logger.info(
    '[OCR] selected: file=%s file_type=%s reasons=%j text_chars=%s images=%s tables=%s',
    path.basename(filePath),
    fileType,
    decision.reasons,
    decision.extractedTextChars,
    decision.imageCount,
    decision.tableCount,
  );
  console.log('\n==================================================');
  console.log('👉 文档解析路线: 【OCR 智能识别】');
  console.log(`👉 文件名称: ${path.basename(filePath)}`);
  console.log(`👉 触发原因: ${decision.reasons}`);
  console.log('==================================================\n');

  const markdownText = await ocrService.parseToMarkdown(filePath);
  const loadedDocument = buildOcrLoadedDocument({
    filePath,
    fileType,
    markdownText,
    decision,
  });
  logger.info(
    '[PARSER] selected: file=%s parser=OCR_%s sections=%s file_type=%s',
    path.basename(filePath),
    loadedDocument.parser_name.toUpperCase(),
    loadedDocument.sections.length,
    loadedDocument.file_type,
  );
  return loadedDocument;
}

/**
 * PDF 加载：优先 OCR；跳过或失败后按页原生抽文本。
 * 每一页一个 pdf_page section（空页丢弃），page_number 为 1-based。
 */
async function loadPdfFile(filePath: string): Promise<LoadedDocument> {
  try {
    const ocrLoadedDocument = await tryLoadWithOcr(filePath, 'pdf');
    if (ocrLoadedDocument) {
      return ocrLoadedDocument;
    }
  } catch (error) {
    logger.warn('[OCR] PDF parsing failed, fallback to native parser: file=%s error=%s', path.basename(filePath), error);
    console.log('\n==================================================');
    console.log('👉 文档解析路线: 【原生解析】 (OCR 失败自动降级)');
    console.log(`👉 文件名称: ${path.basename(filePath)}`);
    console.log(`👉 失败原因: ${error}`);
    console.log('==================================================\n');
  }

  const { pages } = await extractPdfPages(filePath);
  const sections: LoadedSection[] = [];
  pages.forEach((page, pageIndex) => {
    const pageText = cleanText(page || '');
    if (!pageText) {
      return;
    }
    sections.push({
      text: pageText,
      metadata: {
        section_type: 'pdf_page',
        section_index: pageIndex,
        page_number: pageIndex + 1,
      },
    });
  });

  const loadedDocument = new LoadedDocument({
    filename: path.basename(filePath),
    file_type: 'pdf',
    parser_name: 'pypdf_loader',
    sections,
  });
  logger.info(
    '[PARSER] selected: file=%s parser=NATIVE_%s sections=%s file_type=%s',
    path.basename(filePath),
    loadedDocument.parser_name.toUpperCase(),
    loadedDocument.sections.length,
    loadedDocument.file_type,
  );
  return loadedDocument;
}

/** 简易 HTML 去标签：保留换行与常见实体，供 DOCX 标题/段落抽文本。 */
function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * 从 mammoth HTML 中抽出标题与内容块。
 * h1–h6 → heading；p/ul/ol → 去标签后的正文；table 保留原始 HTML 便于后续结构化切分。
 */
function parseDocxHtmlBlocks(html: string): Array<{ kind: 'heading' | 'content'; text: string }> {
  const blocks: Array<{ kind: 'heading' | 'content'; text: string }> = [];
  const regex = /<(h[1-6]|p|table|ul|ol)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const inner = match[2];
    if (tag.startsWith('h')) {
      const text = stripTags(inner);
      if (text) {
        blocks.push({ kind: 'heading', text });
      }
      continue;
    }
    if (tag === 'table') {
      blocks.push({ kind: 'content', text: match[0] });
      continue;
    }
    const text = stripTags(inner);
    if (text) {
      blocks.push({ kind: 'content', text });
    }
  }
  return blocks;
}

/**
 * DOCX 加载：优先 OCR；否则按标题块切成 docx_heading_block。
 * 解析不出任何 section 时，退回 mammoth 纯文本，整篇一个 full_text。
 */
async function loadDocxFile(filePath: string): Promise<LoadedDocument> {
  try {
    const ocrLoadedDocument = await tryLoadWithOcr(filePath, 'docx');
    if (ocrLoadedDocument) {
      return ocrLoadedDocument;
    }
  } catch (error) {
    logger.warn('[OCR] Docx parsing failed, fallback to native parser: file=%s error=%s', path.basename(filePath), error);
    console.log('\n==================================================');
    console.log('👉 文档解析路线: 【原生解析】 (OCR 失败自动降级)');
    console.log(`👉 文件名称: ${path.basename(filePath)}`);
    console.log(`👉 失败原因: ${error}`);
    console.log('==================================================\n');
  }

  const { value: html } = await mammoth.convertToHtml({ path: filePath });
  const blocks = parseDocxHtmlBlocks(html);
  const sections: LoadedSection[] = [];
  let currentTitle = 'Introduction';
  let currentLines: string[] = [];
  let sectionIndex = 0;

  const flushCurrentSection = (): void => {
    const content = cleanText(currentLines.join('\n'));
    if (!content) {
      return;
    }
    sections.push({
      text: content,
      metadata: {
        section_type: 'docx_heading_block',
        section_title: currentTitle,
        section_index: sectionIndex,
      },
    });
    sectionIndex += 1;
  };

  for (const block of blocks) {
    if (block.kind === 'heading') {
      flushCurrentSection();
      currentTitle = block.text;
      currentLines = [block.text];
      continue;
    }
    currentLines.push(block.text);
  }
  flushCurrentSection();

  // 没有标题结构时（纯段落文档）用 raw text 兜底，避免 sections 为空导致无法入库
  if (sections.length === 0) {
    const { value: plain } = await mammoth.extractRawText({ path: filePath });
    const plainText = cleanText(plain);
    sections.push({ text: plainText, metadata: { section_type: 'full_text', section_index: 0 } });
  }

  const loadedDocument = new LoadedDocument({
    filename: path.basename(filePath),
    file_type: 'docx',
    parser_name: 'docx_loader',
    sections,
  });
  logger.info(
    '[PARSER] selected: file=%s parser=NATIVE_%s sections=%s file_type=%s',
    path.basename(filePath),
    loadedDocument.parser_name.toUpperCase(),
    loadedDocument.sections.length,
    loadedDocument.file_type,
  );
  return loadedDocument;
}

/**
 * 旧版 .doc（非 OOXML）：mammoth 无法稳定解析，只走 OCR。
 * 未启用 OCR 或启发式判定不需要时抛错，避免 silently 产出空文档。
 */
async function loadDocFile(filePath: string): Promise<LoadedDocument> {
  const ocrLoadedDocument = await tryLoadWithOcr(filePath, 'doc');
  if (ocrLoadedDocument) {
    return ocrLoadedDocument;
  }
  throw new Error('Legacy .doc files require OCR service configuration to be enabled');
}

/**
 * 由纯文本构造 LoadedDocument（无磁盘文件时）。
 *
 * 用途：ingest-text 入库、rebuild 时缺少 source_path 用旧 chunk 拼回正文。
 * 文件名是 .md 则按标题切；否则整篇一个 inline_text section。
 */
export function buildLoadedDocumentFromText(filename: string, text: string): LoadedDocument {
  const suffix = path.extname(filename).toLowerCase().replace(/^\./, '') || 'txt';
  const sectionType = suffix === 'md' ? 'markdown_heading' : 'inline_text';
  const sections =
    suffix === 'md'
      ? splitMarkdownSections(text)
      : [
        {
          text: cleanText(text),
          metadata: {
            section_type: sectionType,
            section_index: 0,
          },
        },
      ];
  const loadedDocument = new LoadedDocument({
    filename,
    file_type: suffix,
    parser_name: 'inline_text_loader',
    sections,
  });
  logger.info(
    '[PARSER] selected: file=%s parser=%s sections=%s file_type=%s',
    filename,
    loadedDocument.parser_name,
    loadedDocument.sections.length,
    loadedDocument.file_type,
  );
  return loadedDocument;
}

/** 扩展名 → 加载函数。loadDocument 只查这张表。 */
const LOADER_REGISTRY: Record<string, (filePath: string) => Promise<LoadedDocument>> = {
  doc: loadDocFile,
  txt: loadTextFile,
  md: loadMarkdownFile,
  pdf: loadPdfFile,
  docx: loadDocxFile,
};

/**
 * 按文件扩展名分派到对应加载器。
 *
 * @throws 未注册的扩展名（如 .xlsx）抛 Unsupported file type
 */
export async function loadDocument(filePath: string): Promise<LoadedDocument> {
  const fileType = path.extname(filePath).toLowerCase().replace(/^\./, '');
  const loader = LOADER_REGISTRY[fileType];
  if (!loader) {
    throw new Error(`Unsupported file type: ${fileType || 'unknown'}`);
  }
  return loader(filePath);
}
