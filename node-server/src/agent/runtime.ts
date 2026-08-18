/**
 * Agent 请求级检索溯源运行时。
 *
 * 用 AsyncLocalStorage 绑定本次对话的 RetrievalTrace，
 * 使工具函数无需感知 HTTP 请求对象即可写入 source_chunks。
 */

import { AsyncLocalStorage } from 'node:async_hooks';

import { logger } from '../utils/logger.js';

/**
 * 记录一次 Agent 调用过程中产生的检索溯源信息。
 */
export class RetrievalTrace {
  /** 默认检索返回的候选片段数量 */
  top_k: number;
  /** 检索到的源片段列表；每个元素通常是一个类 dict 对象 */
  source_chunks: Record<string, unknown>[];

  constructor(top_k = 5) {
    this.top_k = top_k;
    this.source_chunks = [];
  }
}

/** 请求级上下文：当前绑定的检索溯源容器。 */
const currentRetrievalTrace = new AsyncLocalStorage<RetrievalTrace | undefined>();

/**
 * 把溯源容器绑定到当前异步上下文后执行回调。
 * 并发请求互不串数据；工具侧通过 getCurrentRetrievalTrace 读取。
 */
export function bindRetrievalTrace<T>(trace: RetrievalTrace, fn: () => T): T {
  return currentRetrievalTrace.run(trace, fn);
}

/** 读取当前异步上下文中的检索溯源对象；未绑定则返回 undefined。 */
export function getCurrentRetrievalTrace(): RetrievalTrace | undefined {
  try {
    return currentRetrievalTrace.getStore();
  } catch (error) {
    logger.warn?.(`Failed to read retrieval trace: ${String(error)}`);
    return undefined;
  }
}
