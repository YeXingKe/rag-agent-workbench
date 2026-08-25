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
 * 启动阶段预热关键单例与本地基础设施。
 *
 * 作用：在 HTTP 开始对外服务前，把进程内会反复用到的资源先准备好，
 * 避免第一个请求才触发建连接 / 建表 / 建目录，导致首包很慢或半初始化状态。
 *
 * 会做的事：
 * 1. 初始化 Postgres 连接池，并幂等创建 document / chunk / query_log 表
 * 2. 确保上传目录存在（storage/uploads）
 * 3. 懒创建 Redis / Milvus 客户端对象，并尽量保证 Milvus collection 已就绪
 * 4. 初始化 BM25 索引管理器（内存词法检索）
 * 5. 初始化 Agent 短期记忆 checkpointer（当前为进程内 Map）
 *
 * 不会做的事：
 * - 不强制 ping Postgres / Redis / Milvus（连通性由 GET /health 负责）
 * - 不因某个外部依赖暂时不可用而阻断整个服务启动
 *   （各依赖预热失败只打 warn，服务仍可起来，方便本地联调）
 *
 * 调用时机：`main.ts` 里 `createApp()` / `listen()` 之前。
 */
export async function warmUpSingletons(): Promise<void> {
  // 读取配置单例，确保 .env 已加载（后续各 core 模块也会再次 getSettings）
  const settings = getSettings();
  void settings;

  // 1) 数据库：建连接池 + create_all 风格建表（对应 Python Base.metadata.create_all）
  getPool();
  await initTables();
  // 2) 本地上传目录：保证文件上传接口可直接落盘
  ensureUploadDir();

  // 3) 外部客户端：只构建对象，不强制探测连通性
  try {
    // Redis：会话/缓存预留；未配置 REDIS_URL 时返回 null
    getRedisClient();
  } catch (error) {
    logger.warn(`Redis client warm-up skipped: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    // Milvus：向量库客户端 + 确保 collection / 索引存在
    getMilvusClient();
    await ensureCollection();
  } catch (error) {
    logger.warn(`Milvus warm-up skipped: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    // BM25：进程内词法检索索引管理器（真正重建会在脏标记或首次检索时触发）
    getBm25Index();
  } catch (error) {
    logger.warn(`BM25 warm-up skipped: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 4) Agent 多轮记忆：初始化 checkpointer，供 chat 的 thread_id 使用
  initializeCheckpointer();
  logger.info('Application warm-up completed');
}
