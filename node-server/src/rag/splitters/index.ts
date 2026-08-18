/**
 * 切分器注册表。
 *
 * 作为 RAG 管道中「section → chunks」的统一入口：
 * ingest 根据文件类型 / section_type 选出策略名，再从这里取实现。
 */

import { splitSemiStructuredText } from './semi_structured.js';
import { splitStructuredText } from './structured.js';
import type { SplitChunk, SplitterFn } from './types.js';
import { splitUnstructuredText } from './unstructured.js';

/**
 * 可用切分策略映射。
 *
 * - structured：字段/SQL/配置等条目型文本
 * - semi_structured：Markdown/Docx 标题段落、OCR Markdown
 * - unstructured：纯自然段兜底
 */
export const SPLITTER_REGISTRY: Record<string, SplitterFn> = {
  structured: splitStructuredText,
  semi_structured: splitSemiStructuredText,
  unstructured: splitUnstructuredText,
};

export { splitSemiStructuredText, splitStructuredText, splitUnstructuredText };
export type { SplitChunk, SplitterFn };
