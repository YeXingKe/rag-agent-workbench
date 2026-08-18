import type { BaseMessage } from '@langchain/core/messages';

import { logger } from '../utils/logger.js';

type ThreadId = string;

const threadMemory = new Map<ThreadId, BaseMessage[]>();
let initialized = false;

export interface InMemoryCheckpointer {
  get(threadId: string): BaseMessage[];
  set(threadId: string, messages: BaseMessage[]): void;
  delete_thread(threadId: string): boolean;
  deleteThread(threadId: string): boolean;
}

let checkpointer: InMemoryCheckpointer | null = null;

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

export function getCheckpointer(): InMemoryCheckpointer {
  return initializeCheckpointer();
}

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

export function shutdownCheckpointer(): void {
  threadMemory.clear();
  checkpointer = null;
  initialized = false;
}
