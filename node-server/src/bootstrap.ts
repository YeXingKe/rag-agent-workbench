/**
 * 应用启动预热（对齐参考 Python lifespan）。
 *
 * 只做「构建对象 / 建表 / 确保目录」，不强依赖远端连通性；
 * 真正的连通性检查交给 GET /health。
 */

import { initializeCheckpointer } from './agent/memory.js';
import { getSettings } from './config/settings.js';
import { getMilvusClient, ensureCollection } from './core/milvus.js';
import { getPool } from './core/postgres.js';
import { getRedisClient } from './core/redis.js';
import { initTables } from './models/index.js';
import { getBm25Index } from './rag/bm25_index.js';
import { ensureUploadDir } from './utils/storage.js';
import { logger } from './utils/logger.js';

/**
 * 预热关键单例：建表、上传目录、Redis/Milvus 客户端、BM25、Agent 记忆。
 */
export async function warmUpSingletons(): Promise<void> {
  const settings = getSettings();
  void settings;

  // 确保业务表存在（对应 Python Base.metadata.create_all）
  getPool();
  await initTables();
  ensureUploadDir();

  // 构建客户端对象（不强制 ping）
  try {
    getRedisClient();
  } catch (error) {
    logger.warn(`Redis client warm-up skipped: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    getMilvusClient();
    await ensureCollection();
  } catch (error) {
    logger.warn(`Milvus warm-up skipped: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    getBm25Index();
  } catch (error) {
    logger.warn(`BM25 warm-up skipped: ${error instanceof Error ? error.message : String(error)}`);
  }

  initializeCheckpointer();
  logger.info('Application warm-up completed');
}
