import { splitSemiStructuredText } from './semi_structured.js';
import { splitStructuredText } from './structured.js';
import type { SplitChunk, SplitterFn } from './types.js';
import { splitUnstructuredText } from './unstructured.js';

export const SPLITTER_REGISTRY: Record<string, SplitterFn> = {
  structured: splitStructuredText,
  semi_structured: splitSemiStructuredText,
  unstructured: splitUnstructuredText,
};

export { splitSemiStructuredText, splitStructuredText, splitUnstructuredText };
export type { SplitChunk, SplitterFn };
