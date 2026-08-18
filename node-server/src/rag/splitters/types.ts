export interface SplitChunk {
  chunk_index: number;
  content: string;
  start_offset: number;
  end_offset: number;
}

export type SplitterFn = (
  text: string,
  options?: {
    chunk_size?: number;
    chunk_overlap?: number;
    separators?: string[];
  },
) => SplitChunk[];
