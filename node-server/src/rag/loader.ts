import fs from 'node:fs';
import path from 'node:path';

import chardet from 'chardet';
import iconv from 'iconv-lite';
import mammoth from 'mammoth';

import { OCRService, extractPdfPages, type OCRDetectionDecision } from '../services/ocr_service.js';
import { createLogger } from '../utils/logger.js';
import { cleanText } from '../utils/text.js';

const logger = createLogger('rag.loader');

export interface LoadedSection {
  text: string;
  metadata: Record<string, unknown>;
}

export class LoadedDocument {
  filename: string;
  file_type: string;
  parser_name: string;
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

  get fullText(): string {
    return this.sections
      .filter((section) => section.text.trim())
      .map((section) => section.text)
      .join('\n\n');
  }
}

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

function splitMarkdownSections(text: string): LoadedSection[] {
  const lines = text.split('\n');
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

async function loadDocFile(filePath: string): Promise<LoadedDocument> {
  const ocrLoadedDocument = await tryLoadWithOcr(filePath, 'doc');
  if (ocrLoadedDocument) {
    return ocrLoadedDocument;
  }
  throw new Error('Legacy .doc files require OCR service configuration to be enabled');
}

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

const LOADER_REGISTRY: Record<string, (filePath: string) => Promise<LoadedDocument>> = {
  doc: loadDocFile,
  txt: loadTextFile,
  md: loadMarkdownFile,
  pdf: loadPdfFile,
  docx: loadDocxFile,
};

export async function loadDocument(filePath: string): Promise<LoadedDocument> {
  const fileType = path.extname(filePath).toLowerCase().replace(/^\./, '');
  const loader = LOADER_REGISTRY[fileType];
  if (!loader) {
    throw new Error(`Unsupported file type: ${fileType || 'unknown'}`);
  }
  return loader(filePath);
}
