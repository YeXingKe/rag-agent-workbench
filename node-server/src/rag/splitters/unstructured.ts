/**
 * 非结构化文本切分器。
 *
 * RAG 管道中的兜底策略：不依赖标题/字段结构，
 * 按分隔符优先级在 chunk_size 附近截断，并保留 overlap。
 */

import { DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE, DEFAULT_SEPARATORS } from '../constants.js';
import { cleanText } from '../../utils/text.js';
import type { SplitChunk } from './types.js';

export type { SplitChunk } from './types.js';

/**
 * 在目标长度附近寻找最合适的截断点。
 *
 * 逻辑优先级：
 * 1. 在 chunk_size 范围内从后往前找高优先级分隔符；
 * 2. 找不到则直接在固定长度处截断，保证算法稳定。
 */
export function findSplitPosition(text: string, chunkSize: number, separators: string[]): number {
  if (text.length <= chunkSize) {
    return text.length;
  }

  const candidateText = text.slice(0, chunkSize);
  for (const separator of separators) {
    const splitIndex = candidateText.lastIndexOf(separator);
    if (splitIndex > 0) {
      return splitIndex + separator.length;
    }
  }
  return chunkSize;
}

/**
 * 按最基础的非结构化文本策略切分内容。
 *
 * 该实现故意保持简单可靠：
 * - 足够适合第一版 RAG；
 * - 不依赖额外复杂库；
 * - 能保留 overlap 以降低跨 chunk 语义断裂问题。
 */
export function splitUnstructuredText(
  text: string,
  options: {
    chunk_size?: number;
    chunk_overlap?: number;
    separators?: string[];
  } = {},
): SplitChunk[] {
  const chunkSize = options.chunk_size ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options.chunk_overlap ?? DEFAULT_CHUNK_OVERLAP;
  const separators = options.separators;

  const cleanedText = cleanText(text);
  if (!cleanedText) {
    return [];
  }

  const activeSeparators = separators ?? DEFAULT_SEPARATORS;
  const chunks: SplitChunk[] = [];

  let startOffset = 0;
  let chunkIndex = 0;
  while (startOffset < cleanedText.length) {
    const remainingText = cleanedText.slice(startOffset);
    const splitLength = findSplitPosition(remainingText, chunkSize, activeSeparators);
    const endOffset = Math.min(cleanedText.length, startOffset + splitLength);
    const chunkContent = cleanedText.slice(startOffset, endOffset).trim();

    if (chunkContent) {
      chunks.push({
        chunk_index: chunkIndex,
        content: chunkContent,
        start_offset: startOffset,
        end_offset: endOffset,
      });
      chunkIndex += 1;
    }

    if (endOffset >= cleanedText.length) {
      break;
    }

    // 回退 overlap，让相邻 chunk 有重叠上下文
    startOffset = Math.max(0, endOffset - chunkOverlap);
  }

  return chunks;
}
