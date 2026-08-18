import { DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE, DEFAULT_SEPARATORS } from '../constants.js';
import { cleanText } from '../../utils/text.js';
import type { SplitChunk } from './types.js';

export type { SplitChunk } from './types.js';

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

    startOffset = Math.max(0, endOffset - chunkOverlap);
  }

  return chunks;
}
