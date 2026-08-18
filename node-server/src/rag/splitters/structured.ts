import { DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE } from '../constants.js';
import { cleanText } from '../../utils/text.js';
import type { SplitChunk } from './types.js';
import { splitUnstructuredText } from './unstructured.js';

const STRUCTURED_LINE_PATTERNS = [
  /^\s*[\p{L}\p{N}_.-]+\s*[:：]\s*.+$/iu,
  /^\s*[-*]\s+.+$/iu,
  /^\s*\d+[.)、]\s+.+$/iu,
  /^\s*(create|alter|drop|select|insert|update|delete)\b.+$/iu,
];

function isStructuredLine(line: string): boolean {
  const normalizedLine = line.trim();
  if (!normalizedLine) {
    return false;
  }
  return STRUCTURED_LINE_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(normalizedLine);
  });
}

export function splitStructuredText(
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

  const lines = cleanedText.split('\n');
  const groupedBlocks: string[] = [];
  let currentBlock: string[] = [];

  for (const line of lines) {
    const strippedLine = line.trim();
    if (!strippedLine) {
      if (currentBlock.length > 0) {
        groupedBlocks.push(currentBlock.join('\n'));
        currentBlock = [];
      }
      continue;
    }

    if (isStructuredLine(strippedLine)) {
      if (currentBlock.length > 0) {
        groupedBlocks.push(currentBlock.join('\n'));
      }
      currentBlock = [strippedLine];
      continue;
    }

    currentBlock.push(strippedLine);
  }

  if (currentBlock.length > 0) {
    groupedBlocks.push(currentBlock.join('\n'));
  }

  if (groupedBlocks.length === 0) {
    return splitUnstructuredText(cleanedText, { chunk_size: chunkSize, chunk_overlap: chunkOverlap });
  }

  const chunks: SplitChunk[] = [];
  let offsetCursor = 0;
  for (const block of groupedBlocks) {
    const normalizedBlock = cleanText(block);
    if (!normalizedBlock) {
      continue;
    }

    if (normalizedBlock.length > chunkSize) {
      const blockChunks = splitUnstructuredText(normalizedBlock, {
        chunk_size: chunkSize,
        chunk_overlap: chunkOverlap,
      });
      for (const blockChunk of blockChunks) {
        chunks.push({
          chunk_index: chunks.length,
          content: blockChunk.content,
          start_offset: offsetCursor + blockChunk.start_offset,
          end_offset: offsetCursor + blockChunk.end_offset,
        });
      }
      offsetCursor += normalizedBlock.length + 2;
      continue;
    }

    chunks.push({
      chunk_index: chunks.length,
      content: normalizedBlock,
      start_offset: offsetCursor,
      end_offset: offsetCursor + normalizedBlock.length,
    });
    offsetCursor += normalizedBlock.length + 2;
  }

  return chunks;
}
