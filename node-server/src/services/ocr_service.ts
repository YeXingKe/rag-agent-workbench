import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import mammoth from 'mammoth';

import { getSettings } from '../config/settings.js';
import { createLogger } from '../utils/logger.js';
import { cleanText } from '../utils/text.js';

const logger = createLogger('services.ocr');
const require = createRequire(import.meta.url);

type PdfParseFn = (
  dataBuffer: Buffer,
  options?: { pagerender?: (pageData: PdfPageData) => Promise<string> | string },
) => Promise<{ text: string; numpages: number }>;

interface PdfPageData {
  getTextContent: () => Promise<{ items: Array<{ str?: string; transform?: number[] }> }>;
}

const pdfParse = require('pdf-parse/lib/pdf-parse.js') as PdfParseFn;

export class OCRDetectionDecision {
  shouldUseOcr: boolean;
  fileType: string;
  reasons: string[];
  extractedTextChars: number;
  imageCount: number;
  tableCount: number;
  emptyBlockCount: number;
  totalBlockCount: number;

  constructor(input: {
    shouldUseOcr: boolean;
    fileType: string;
    reasons?: string[];
    extractedTextChars?: number;
    imageCount?: number;
    tableCount?: number;
    emptyBlockCount?: number;
    totalBlockCount?: number;
  }) {
    this.shouldUseOcr = input.shouldUseOcr;
    this.fileType = input.fileType;
    this.reasons = input.reasons ?? [];
    this.extractedTextChars = input.extractedTextChars ?? 0;
    this.imageCount = input.imageCount ?? 0;
    this.tableCount = input.tableCount ?? 0;
    this.emptyBlockCount = input.emptyBlockCount ?? 0;
    this.totalBlockCount = input.totalBlockCount ?? 0;
  }

  toMetadata(): Record<string, unknown> {
    return {
      ocr_enabled: this.shouldUseOcr,
      ocr_reasons: this.reasons,
      ocr_detected_text_chars: this.extractedTextChars,
      ocr_detected_image_count: this.imageCount,
      ocr_detected_table_count: this.tableCount,
      ocr_detected_empty_block_count: this.emptyBlockCount,
      ocr_detected_total_block_count: this.totalBlockCount,
    };
  }
}

export async function extractPdfPages(filePath: string): Promise<{ pages: string[]; numpages: number; buffer: Buffer }> {
  const buffer = await fs.promises.readFile(filePath);
  const pages: string[] = [];
  const result = await pdfParse(buffer, {
    pagerender: async (pageData) => {
      const textContent = await pageData.getTextContent();
      let lastY: number | undefined;
      let text = '';
      for (const item of textContent.items) {
        const currentY = item.transform?.[5];
        if (lastY === currentY || lastY === undefined) {
          text += item.str ?? '';
        } else {
          text += `\n${item.str ?? ''}`;
        }
        lastY = currentY;
      }
      pages.push(text);
      return text;
    },
  });
  return { pages: pages.length > 0 ? pages : result.text ? [result.text] : [], numpages: result.numpages, buffer };
}

function countPdfImages(buffer: Buffer): number {
  const matches = buffer.toString('latin1').match(/\/Subtype\s*\/Image/g);
  return matches?.length ?? 0;
}

function countTableLikeLines(text: string): number {
  let count = 0;
  for (const line of text.split('\n')) {
    const stripped = line.trim();
    if (!stripped) {
      continue;
    }
    const hasDelimiter = stripped.includes('|') || stripped.includes('\t');
    const hasAlignedSpaces = stripped.includes('  ') && stripped.split(/\s+/).length >= 3;
    if (hasDelimiter || hasAlignedSpaces) {
      count += 1;
    }
  }
  return count;
}

async function resolveOcrAccessToken(): Promise<string | null> {
  const settings = getSettings();
  if (settings.ocrAccessToken) {
    return settings.ocrAccessToken;
  }
  if (!settings.ocrClientId || !settings.ocrClientSecret) {
    return null;
  }

  const tokenUrl =
    `${settings.ocrTokenUrl}?grant_type=client_credentials` +
    `&client_id=${settings.ocrClientId}` +
    `&client_secret=${settings.ocrClientSecret}`;

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: '',
  });
  const payload = (await response.json()) as { access_token?: string };
  const accessToken = String(payload.access_token || '').trim();
  if (!accessToken) {
    throw new Error(`Failed to obtain OCR access token: response=${JSON.stringify(payload)}`);
  }
  logger.info('[OCR] access token resolved via client credentials');
  return accessToken;
}

function appendAccessToken(url: string, accessToken: string | null): string {
  if (!accessToken) {
    return url;
  }
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}access_token=${accessToken}`;
}

async function postForm(url: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    body.set(key, String(value));
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const rawText = await response.text();
  return JSON.parse(rawText) as Record<string, unknown>;
}

async function downloadText(url: string): Promise<string> {
  const response = await fetch(url);
  return response.text();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class OCRService {
  static readonly SUPPORTED_FILE_TYPES = new Set(['pdf', 'doc', 'docx']);

  canUseOcr(): boolean {
    const currentSettings = getSettings();
    return Boolean(
      currentSettings.ocrEnabled &&
        currentSettings.ocrTaskUrl &&
        currentSettings.ocrQueryUrl &&
        this.hasAuthMaterial(),
    );
  }

  private hasAuthMaterial(): boolean {
    const currentSettings = getSettings();
    return Boolean(
      currentSettings.ocrAccessToken || (currentSettings.ocrClientId && currentSettings.ocrClientSecret),
    );
  }

  async analyzeDocument(filePath: string): Promise<OCRDetectionDecision> {
    const fileType = path.extname(filePath).toLowerCase().replace(/^\./, '');
    if (!this.canUseOcr() || !OCRService.SUPPORTED_FILE_TYPES.has(fileType)) {
      return new OCRDetectionDecision({ shouldUseOcr: false, fileType });
    }
    if (fileType === 'pdf') {
      return this.analyzePdf(filePath);
    }
    if (fileType === 'docx') {
      return this.analyzeDocx(filePath);
    }
    return new OCRDetectionDecision({
      shouldUseOcr: true,
      fileType,
      reasons: ['legacy_word_requires_ocr'],
    });
  }

  async parseToMarkdown(filePath: string): Promise<string> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    if (!this.canUseOcr()) {
      throw new Error('OCR service is not configured');
    }

    const taskResponse = await this.createTask(filePath);
    const result = (taskResponse.result ?? {}) as Record<string, unknown>;
    const taskId = String(result.task_id);
    const markdownUrl = await this.pollMarkdownUrl(taskId);
    const markdownContent = await downloadText(markdownUrl);
    const cleanedMarkdown = cleanText(markdownContent);
    logger.info(
      '[OCR] markdown downloaded: file=%s task_id=%s markdown_chars=%s',
      path.basename(filePath),
      taskId,
      cleanedMarkdown.length,
    );
    return cleanedMarkdown;
  }

  private async analyzePdf(filePath: string): Promise<OCRDetectionDecision> {
    const settings = getSettings();
    const { pages, numpages, buffer } = await extractPdfPages(filePath);
    const totalPages = numpages || pages.length;
    let extractedTextChars = 0;
    let emptyPageCount = 0;
    let tableLikeLineCount = 0;

    for (const page of pages) {
      const pageText = cleanText(page || '');
      extractedTextChars += pageText.length;
      if (pageText.length < settings.ocrPdfMinPageChars) {
        emptyPageCount += 1;
      }
      tableLikeLineCount += countTableLikeLines(pageText);
    }

    const imageCount = countPdfImages(buffer);
    const avgTextChars = extractedTextChars / Math.max(totalPages, 1);
    const reasons: string[] = [];
    if (totalPages > 0 && emptyPageCount === totalPages) {
      reasons.push('all_pages_have_too_little_text');
    }
    if (totalPages > 0 && emptyPageCount / totalPages >= settings.ocrPdfEmptyPageRatio) {
      reasons.push('most_pages_have_too_little_text');
    }
    if (imageCount > 0 && avgTextChars <= settings.ocrPdfLowTextAvgChars) {
      reasons.push('pdf_contains_images_and_low_text_density');
    }
    if (tableLikeLineCount >= settings.ocrTableLikeLineThreshold) {
      reasons.push('pdf_contains_table_like_layout');
    }

    return new OCRDetectionDecision({
      shouldUseOcr: reasons.length > 0,
      fileType: 'pdf',
      reasons,
      extractedTextChars,
      imageCount,
      tableCount: tableLikeLineCount >= settings.ocrTableLikeLineThreshold ? 1 : 0,
      emptyBlockCount: emptyPageCount,
      totalBlockCount: totalPages,
    });
  }

  private async analyzeDocx(filePath: string): Promise<OCRDetectionDecision> {
    const settings = getSettings();
    const [htmlResult, textResult] = await Promise.all([
      mammoth.convertToHtml({ path: filePath }),
      mammoth.extractRawText({ path: filePath }),
    ]);
    const paragraphTexts = textResult.value
      .split(/\n+/)
      .map((text) => cleanText(text))
      .filter((text) => text.length > 0);
    const extractedTextChars = paragraphTexts.reduce((sum, text) => sum + text.length, 0);
    const tableCount = (htmlResult.value.match(/<table/gi) ?? []).length;
    const imageCount = (htmlResult.value.match(/<img/gi) ?? []).length;

    const reasons: string[] = [];
    const hasLowTextDensity = extractedTextChars <= settings.ocrDocxMinChars;
    if (imageCount > 0) {
      reasons.push('docx_contains_images');
    }
    if (tableCount > 0) {
      reasons.push('docx_contains_tables');
    }
    if (hasLowTextDensity) {
      reasons.push('docx_text_density_is_low');
    }

    return new OCRDetectionDecision({
      shouldUseOcr: reasons.length > 0,
      fileType: 'docx',
      reasons,
      extractedTextChars,
      imageCount,
      tableCount,
      emptyBlockCount: 0,
      totalBlockCount: Math.max(1, paragraphTexts.length),
    });
  }

  private async createTask(filePath: string): Promise<Record<string, unknown>> {
    const encodedFile = (await fs.promises.readFile(filePath)).toString('base64');
    const payload = {
      file_data: encodedFile,
      file_url: '',
      file_name: path.basename(filePath),
    };
    const currentSettings = getSettings();
    const accessToken = await resolveOcrAccessToken();
    const response = await postForm(appendAccessToken(currentSettings.ocrTaskUrl, accessToken), payload);
    logger.info('[OCR] task created: file=%s response_keys=%j', path.basename(filePath), Object.keys(response));
    return response;
  }

  private async pollMarkdownUrl(taskId: string): Promise<string> {
    const currentSettings = getSettings();
    const accessToken = await resolveOcrAccessToken();
    for (let attempt = 0; attempt < currentSettings.ocrPollMaxAttempts; attempt += 1) {
      const queryResponse = await postForm(appendAccessToken(currentSettings.ocrQueryUrl, accessToken), {
        task_id: taskId,
      });
      const result = (queryResponse.result ?? {}) as Record<string, unknown>;
      const status = String(result.status || '').toLowerCase();
      logger.info('[OCR] task polling: task_id=%s status=%s', taskId, status || 'unknown');

      if (status === 'success') {
        const markdownUrl = String(result.markdown_url || '');
        if (!markdownUrl) {
          throw new Error(`OCR task succeeded but markdown_url is empty: task_id=${taskId}`);
        }
        return markdownUrl;
      }
      if (status === 'failed') {
        throw new Error(`OCR task failed: task_id=${taskId}, error=${String(result.task_error ?? '')}`);
      }
      await sleep(currentSettings.ocrPollIntervalSec * 1000);
    }
    throw new Error(`OCR task timed out: task_id=${taskId}`);
  }
}

export function canUseOcr(): boolean {
  return new OCRService().canUseOcr();
}
