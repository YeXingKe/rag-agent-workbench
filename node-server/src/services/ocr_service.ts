/**
 * 文档 OCR 服务。
 *
 * 在 RAG 加载阶段作为增强能力：
 * 1. 对 PDF / DOCX 做启发式判断，决定是否值得走 OCR；
 * 2. 命中后调用外部文档解析服务，把结果转成 Markdown。
 *
 * 设计原则：OCR 非强依赖；调用失败时由 loader 回退原生解析。
 */

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

/**
 * OCR 决策结果。
 *
 * 把「是否走 OCR」抽象成对象而不是布尔值，便于：
 * - 把判断原因落日志；
 * - 透传到文档 / section metadata；
 * - 前端调试「为什么这次走了 OCR」。
 */
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

  /** 把决策结果压平成可落 metadata 的结构。 */
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

/**
 * 按页提取 PDF 的「文字层」（不是 OCR 认图）。
 *
 * pdf-parse 默认会把整份 PDF 拼成一段；这里自定义 pagerender：
 * 用每个文字块的 Y 坐标判断是否换行，尽量保住版面里的行结构。
 *
 * 返回：
 * - pages：每一页抽出的文本（下标 0 = 第 1 页）
 * - numpages：总页数
 * - buffer：原始文件字节（调用方还要用来数图片 / 做启发式）
 *
 * 用途：OCR 决策（字少不多）以及 loader 原生解析 PDF（一页一个 section）。
 */

/**
 * pdfParse：打开文件 → 按页走 → 调用 getTextContent() 拿到这一页所有字块
 * PDF 不是 Word 那种「一段段文字」，而是一页画布上，很多「字块」各自带着坐标。解析就是把这些字块按位置拼回人能读的字符串
 * 对每一页：
  取出所有字块（阅读顺序大致从左到右、从上到下）
  看当前块的 Y 和上一块是不是一样
  一样 → 还在同一行，直接拼在后面
  变了 → 换行，先加 \n 再拼
  这一页拼完，推进 pages[]（第 0 项就是第 1 页）
 */
export async function extractPdfPages(filePath: string): Promise<{ pages: string[]; numpages: number; buffer: Buffer }> {
  // 把 PDF 整文件读进内存，后续解析和数图都用这份 buffer
  const buffer = await fs.promises.readFile(filePath);
  // 按页收集文本；pagerender 每处理一页就 push 一次
  const pages: string[] = [];
  // 调用 pdf-parse：传入自定义 pagerender，才能拿到「按页 + 按行」的文本
  const result = await pdfParse(buffer, {
    // 每一页都会回调一次；pageData 是 PDF.js 的页面对象
    pagerender: async (pageData) => {
      // 取出该页所有文字片段（每个 item 有 str 和 transform 矩阵）
      const textContent = await pageData.getTextContent();
      // 上一片段的 Y 坐标；用来判断是否还在同一行
      let lastY: number | undefined;
      // 当前页拼出来的纯文本
      let text = '';
      // 按 PDF 给出的阅读顺序遍历每个文字块
      for (const item of textContent.items) {
        // transform[5] 是该文字块的 Y（PDF 坐标系，原点在页脚附近）
        const currentY = item.transform?.[5];
        // 同一行（Y 相同）或本页第一个块：直接拼在后面，不换行
        if (lastY === currentY || lastY === undefined) {
          text += item.str ?? '';
        } else {
          // Y 变了 = 换到下一行，先插换行再拼字
          text += `\n${item.str ?? ''}`;
        }
        // 记下当前 Y，供下一块比较
        lastY = currentY;
      }
      // 本页拼完，放入 pages（即使是空字符串也占一页，方便后面按页统计）
      pages.push(text);
      // 返回值给 pdf-parse 内部汇总；我们真正用的是上面的 pages 数组
      return text;
    },
  });
  // pages 有内容用按页结果；否则退回 pdf-parse 自带的整篇 text（极端兜底）
  return { pages: pages.length > 0 ? pages : result.text ? [result.text] : [], numpages: result.numpages, buffer };
}

/** 粗估 PDF 内嵌图片数量（扫描 /Subtype /Image）。 */
function countPdfImages(buffer: Buffer): number {
  const matches = buffer.toString('latin1').match(/\/Subtype\s*\/Image/g);
  return matches?.length ?? 0;
}

/**
 * 统计「像表格」的行数。
 * 启发：含 | / Tab，或有多列空格对齐。
 */
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

/** 解析 OCR access_token：优先配置直出，否则 client_credentials 换取。 */
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

/**
 * 文档 OCR 服务。
 *
 * 当前职责：
 * 1. analyzeDocument：启发式判断是否建议 OCR；
 * 2. parseToMarkdown：创建任务 → 轮询 → 下载 Markdown。
 */
export class OCRService {
  static readonly SUPPORTED_FILE_TYPES = new Set(['pdf', 'doc', 'docx']);

  /** 判断当前环境是否具备 OCR 调用条件。 */
  canUseOcr(): boolean {
    const currentSettings = getSettings();
    return Boolean(
      currentSettings.ocrEnabled &&
      currentSettings.ocrTaskUrl &&
      currentSettings.ocrQueryUrl &&
      this.hasAuthMaterial(),
    );
  }

  /** 判断是否具备 OCR 鉴权材料。 */
  private hasAuthMaterial(): boolean {
    const currentSettings = getSettings();
    return Boolean(
      currentSettings.ocrAccessToken || (currentSettings.ocrClientId && currentSettings.ocrClientSecret),
    );
  }

  /**
   * 根据文件内容判断是否建议走 OCR。
   *
   * 未配置 / 不支持类型 → 直接 false；
   * 旧版 .doc → 强制建议 OCR。
   */
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

  /**
   * 调用外部 OCR：上传文件 → 轮询任务 → 下载 Markdown。
   */
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

  /**
   * PDF OCR 决策启发：只判断「要不要走 OCR」，并不真正认图。
   *
   * 命中任一条件则 shouldUseOcr=true：
   * - 全页/大部分页文本过少（像扫描件）；
   * - 有内嵌图且平均每页字数偏低；
   * - 表格式排版行数超过阈值（原生抽文本容易乱）。
   */
  private async analyzePdf(filePath: string): Promise<OCRDetectionDecision> {
    // 读阈值：ocrPdfMinPageChars / emptyPageRatio / lowTextAvgChars / tableLikeLineThreshold
    const settings = getSettings();
    // 抽出每页文字层 + 原始 buffer（buffer 稍后用来数 /Image）
    const { pages, numpages, buffer } = await extractPdfPages(filePath);
    // 总页数：优先 PDF 元数据；异常时退回 pages 数组长度
    const totalPages = numpages || pages.length;
    // 全文合计字符数（清洗后）
    let extractedTextChars = 0;
    // 「字太少」的页数，当作近似空页
    let emptyPageCount = 0;
    // 看起来像表格行的累计条数（含 |、tab、多列空格对齐）
    let tableLikeLineCount = 0;

    // 逐页统计字数、空页、表格行
    for (const page of pages) {
      // 去掉空白噪音，空页会变成 ""
      const pageText = cleanText(page || '');
      extractedTextChars += pageText.length;
      // 默认少于 80 字视为该页文字层不够（扫描页常见）
      if (pageText.length < settings.ocrPdfMinPageChars) {
        emptyPageCount += 1;
      }
      // 累加本页疑似表格行
      tableLikeLineCount += countTableLikeLines(pageText);
    }

    // 粗数 PDF 里 /Subtype /Image，扫描件通常 > 0
    const imageCount = countPdfImages(buffer);
    // 平均每页字数；totalPages 为 0 时用 1 避免除零
    const avgTextChars = extractedTextChars / Math.max(totalPages, 1);
    // 命中的原因列表；只要有一条，就建议 OCR
    const reasons: string[] = [];
    // 每一页都字太少 → 很像整本扫描件
    if (totalPages > 0 && emptyPageCount === totalPages) {
      reasons.push('all_pages_have_too_little_text');
    }
    // 空页占比达到阈值（默认 35%）→ 大部分页抽不出字
    if (totalPages > 0 && emptyPageCount / totalPages >= settings.ocrPdfEmptyPageRatio) {
      reasons.push('most_pages_have_too_little_text');
    }
    // 有图 + 平均字数不超过阈值（默认 120）→ 图多字少
    if (imageCount > 0 && avgTextChars <= settings.ocrPdfLowTextAvgChars) {
      reasons.push('pdf_contains_images_and_low_text_density');
    }
    // 表格行数达到阈值（默认 3）→ 原生按坐标抽文本容易乱栏
    if (tableLikeLineCount >= settings.ocrTableLikeLineThreshold) {
      reasons.push('pdf_contains_table_like_layout');
    }

    // 打包决策：有 reason 就走 OCR；统计字段写入 metadata 方便排查
    return new OCRDetectionDecision({
      shouldUseOcr: reasons.length > 0,
      fileType: 'pdf',
      reasons,
      extractedTextChars,
      imageCount,
      // 只记「是否像有表」，不精确数表格个数
      tableCount: tableLikeLineCount >= settings.ocrTableLikeLineThreshold ? 1 : 0,
      emptyBlockCount: emptyPageCount,
      totalBlockCount: totalPages,
    });
  }

  /**
   * DOCX OCR 决策启发：含图片、含表格、或纯文本字数过低。
   */
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

  /** 轮询 OCR 任务直到 success / failed / 超时。 */
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

/** 便捷函数：当前环境是否可调用 OCR。 */
export function canUseOcr(): boolean {
  return new OCRService().canUseOcr();
}
