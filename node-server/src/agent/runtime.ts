import { AsyncLocalStorage } from 'node:async_hooks';

import { logger } from '../utils/logger.js';

export class RetrievalTrace {
  /** Default number of candidate snippets to retrieve. */
  top_k: number;
  /** Retrieved source snippets; each item is typically a dict-like object. */
  source_chunks: Record<string, unknown>[];

  constructor(top_k = 5) {
    this.top_k = top_k;
    this.source_chunks = [];
  }
}

const currentRetrievalTrace = new AsyncLocalStorage<RetrievalTrace | undefined>();

export function bindRetrievalTrace<T>(trace: RetrievalTrace, fn: () => T): T {
  return currentRetrievalTrace.run(trace, fn);
}

export function getCurrentRetrievalTrace(): RetrievalTrace | undefined {
  try {
    return currentRetrievalTrace.getStore();
  } catch (error) {
    logger.warn?.(`Failed to read retrieval trace: ${String(error)}`);
    return undefined;
  }
}
