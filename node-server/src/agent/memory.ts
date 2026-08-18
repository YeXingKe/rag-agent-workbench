/**
 * Agent 短期记忆（Checkpointer）。
 *
 * Node 端使用进程内 Map 按 thread_id 保存消息历史，
 * 支撑多轮对话；进程重启后记忆会丢失（适合本地开发与演示）。
 */

import type { BaseMessage } from '@langchain/core/messages';

import { logger } from '../utils/logger.js';

type ThreadId = string;

/** thread_id → 可持久化消息列表 */
const threadMemory = new Map<ThreadId, BaseMessage[]>();
let initialized = false;

/** 内存版 checkpointer 接口（兼容 snake_case / camelCase 删除方法）。 */
export interface InMemoryCheckpointer {
  get(threadId: string): BaseMessage[];
  set(threadId: string, messages: BaseMessage[]): void;
  delete_thread(threadId: string): boolean;
  deleteThread(threadId: string): boolean;
}

let checkpointer: InMemoryCheckpointer | null = null;

/**
 * 初始化并缓存内存 checkpointer。
 * 设计策略：保证本地开发和最小演示链路始终可用。
 */
export function initializeCheckpointer(): InMemoryCheckpointer {
  if (checkpointer != null && initialized) {
    return checkpointer;
  }

  checkpointer = {
    get(threadId: string): BaseMessage[] {
      return [...(threadMemory.get(threadId) ?? [])];
    },
    set(threadId: string, messages: BaseMessage[]): void {
      threadMemory.set(threadId, [...messages]);
    },
    delete_thread(threadId: string): boolean {
      threadMemory.delete(threadId);
      return true;
    },
    deleteThread(threadId: string): boolean {
      threadMemory.delete(threadId);
      return true;
    },
  };
  initialized = true;
  logger.info('Using in-memory checkpointer for agent memory');
  return checkpointer;
}

/** 获取 checkpointer 单例（未初始化时自动初始化）。 */
export function getCheckpointer(): InMemoryCheckpointer {
  return initializeCheckpointer();
}

/**
 * 清空指定 thread 的短期记忆。
 * @returns 是否成功调用删除接口
 */
export function clearThreadMemory(threadId: string): boolean {
  const current = getCheckpointer();
  const deleteThread = current.delete_thread ?? current.deleteThread;
  if (typeof deleteThread !== 'function') {
    logger.warn('Current checkpointer does not support delete_thread');
    return false;
  }
  deleteThread.call(current, threadId);
  return true;
}

/** 关闭并清空所有记忆状态（测试或优雅退出时调用）。 */
export function shutdownCheckpointer(): void {
  threadMemory.clear();
  checkpointer = null;
  initialized = false;
}
