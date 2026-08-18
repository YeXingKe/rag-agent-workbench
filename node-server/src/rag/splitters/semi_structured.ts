/**
 * 半结构化文本切分器。
 *
 * 适用于 Markdown/Docx 标题段落、OCR 产出的 Markdown：
 * 介于强结构化字段与纯自然段之间，优先按段落聚合，必要时再细切。
 */

import { DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE } from '../constants.js';
import { cleanText } from '../../utils/text.js';
import type { SplitChunk } from './types.js';
import { splitUnstructuredText } from './unstructured.js';

/**
 * 面向半结构化文本的切分策略。
 *
 * 适用场景：
 * - Markdown / Docx 的标题段落块
 * - 业务说明、方案与流程文档
 * - OCR 转成的 Markdown（可能含 table/img）
 *
 * 算法要点：
 * 1. 若存在 HTML，先把 <table> / 含 <img> 的 div 保护成占位符，避免被拆碎；
 * 2. 按空行段落聚合，直到接近 chunk_size；
 * 3. 超长且不含受保护块时，回退非结构化切分。
 */
export function splitSemiStructuredText(
  text: string,
  options: {
    chunk_size?: number;
    chunk_overlap?: number;
  } = {},
): SplitChunk[] {
  const chunkSize = options.chunk_size ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options.chunk_overlap ?? DEFAULT_CHUNK_OVERLAP;

  const cleanedText = cleanText(text);
  if (!cleanedText) {
    return [];
  }

  // 第一步：保护 HTML 块；无 HTML 时走快速路径跳过正则替换
  const protectedBlocks: string[] = [];
  let textWithPlaceholders = cleanedText;

  const textLower = cleanedText.toLowerCase();
  const hasHtml = textLower.includes('<table') || textLower.includes('<img');

  if (hasHtml) {
    textWithPlaceholders = textWithPlaceholders.replace(/(<table[\s\S]*?>[\s\S]*?<\/table>)/gi, (block) => {
      // 过大的 table 不做保护，避免单 chunk 膨胀失控
      if (block.length > 8000) {
        return block;
      }
      protectedBlocks.push(block);
      return `\n\n__PROTECTED_HTML_BLOCK_${protectedBlocks.length - 1}__\n\n`;
    });

    textWithPlaceholders = textWithPlaceholders.replace(
      /(<div[\s\S]*?>[\s\S]*?<img[\s\S]*?>[\s\S]*?<\/div>)/gi,
      (block) => {
        if (block.length > 8000) {
          return block;
        }
        protectedBlocks.push(block);
        return `\n\n__PROTECTED_HTML_BLOCK_${protectedBlocks.length - 1}__\n\n`;
      },
    );
  }

  const paragraphs = textWithPlaceholders
    .split('\n\n')
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  // 还原占位符为原始 HTML 块
  const restoredParagraphs = paragraphs.map((paragraph) => {
    let restored = paragraph;
    for (let index = 0; index < protectedBlocks.length; index += 1) {
      const placeholder = `__PROTECTED_HTML_BLOCK_${index}__`;
      if (restored.includes(placeholder)) {
        restored = restored.replace(placeholder, protectedBlocks[index]);
      }
    }
    return restored;
  });

  if (restoredParagraphs.length === 0) {
    return [];
  }

  const chunks: SplitChunk[] = [];
  let currentText = '';
  let currentStart = 0;
  let offsetCursor = 0;

  for (const paragraph of restoredParagraphs) {
    const candidateText = currentText ? `${currentText}\n\n${paragraph}` : paragraph;
    if (currentText && candidateText.length > chunkSize) {
      // 当前块已满：落盘后开启新块，起点回退一小段 overlap
      chunks.push({
        chunk_index: chunks.length,
        content: currentText,
        start_offset: currentStart,
        end_offset: currentStart + currentText.length,
      });
      currentStart = Math.max(0, offsetCursor - Math.min(chunkOverlap, paragraph.length));
      currentText = paragraph;
    } else {
      if (!currentText) {
        currentStart = offsetCursor;
      }
      currentText = candidateText;
    }

    offsetCursor += paragraph.length + 2;
  }

  if (currentText) {
    if (currentText.length > chunkSize) {
      const hasProtected = protectedBlocks.some((block) => currentText.includes(block));
      if (hasProtected) {
        // 含受保护 HTML：整块保留，避免 table/图文被硬切
        chunks.push({
          chunk_index: chunks.length,
          content: currentText,
          start_offset: currentStart,
          end_offset: currentStart + currentText.length,
        });
      } else {
        const overflowChunks = splitUnstructuredText(currentText, {
          chunk_size: chunkSize,
          chunk_overlap: chunkOverlap,
        });
        for (const overflowChunk of overflowChunks) {
          chunks.push({
            chunk_index: chunks.length,
            content: overflowChunk.content,
            start_offset: currentStart + overflowChunk.start_offset,
            end_offset: currentStart + overflowChunk.end_offset,
          });
        }
      }
    } else {
      chunks.push({
        chunk_index: chunks.length,
        content: currentText,
        start_offset: currentStart,
        end_offset: currentStart + currentText.length,
      });
    }
  }

  return chunks;
}
