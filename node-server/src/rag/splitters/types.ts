/**
 * 切分器公共类型定义。
 *
 * 所有 splitter 的输出统一成 SplitChunk，便于：
 * - 入库（Postgres chunk 表）；
 * - 向量化（Milvus）；
 * - 前端溯源回显。
 */

/** 单次切分得到的 chunk 结构。 */
export interface SplitChunk {
  /** 当前文本内的 chunk 序号（从 0 开始）。 */
  chunk_index: number;
  /** chunk 正文内容。 */
  content: string;
  /** 在源文本中的起始偏移（字符）。 */
  start_offset: number;
  /** 在源文本中的结束偏移（字符，不含）。 */
  end_offset: number;
}

/**
 * 切分函数签名。
 *
 * 各策略实现可接收 chunk_size / chunk_overlap / separators 覆盖默认常量。
 */
export type SplitterFn = (
  text: string,
  options?: {
    chunk_size?: number;
    chunk_overlap?: number;
    separators?: string[];
  },
) => SplitChunk[];
