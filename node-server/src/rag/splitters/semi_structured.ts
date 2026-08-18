import { DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE } from '../constants.js';
import { cleanText } from '../../utils/text.js';
import type { SplitChunk } from './types.js';
import { splitUnstructuredText } from './unstructured.js';

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

  const protectedBlocks: string[] = [];
  let textWithPlaceholders = cleanedText;

  const textLower = cleanedText.toLowerCase();
  const hasHtml = textLower.includes('<table') || textLower.includes('<img');

  if (hasHtml) {
    textWithPlaceholders = textWithPlaceholders.replace(/(<table[\s\S]*?>[\s\S]*?<\/table>)/gi, (block) => {
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
