/**
 * Redis 客户端封装
 *
 * 按 REDIS_URL 懒创建 ioredis 连接；未配置时返回 null，调用方自行降级。
 */
import { Redis } from 'ioredis'; // ioredis 客户端类

import { getSettings } from '../config/settings.js'; // 读取 REDIS_URL

/**
 * 三态单例：
 * - undefined：还没初始化
 * - null：已确认未配置 REDIS_URL
 * - Redis：已创建客户端
 */
let redisClient: Redis | null | undefined; // 进程内只保留一份

/**
 * 获取 Redis 客户端（懒连接单例）。
 *
 * @returns 已配置时返回 ioredis 实例；未配置 REDIS_URL 时返回 null
 */
export function getRedisClient(): Redis | null {
  if (redisClient !== undefined) { // 已经判定过：有实例或明确没有 Redis
    return redisClient; // 直接返回缓存，不再读配置
  }

  const redisUrl = getSettings().redisUrl; // 从 .env 取 REDIS_URL
  if (!redisUrl) { // 没配 Redis
    redisClient = null; // 记下「未配置」，避免每次再判断
    return null; // 调用方自行降级
  }

  redisClient = new Redis(redisUrl, { // 按 URL 创建客户端
    connectTimeout: 5_000, // 建连超时 5 秒
    commandTimeout: 5_000, // 单条命令超时 5 秒
    maxRetriesPerRequest: 2, // 单次请求最多重试 2 次
    enableReadyCheck: true, // 等 Redis 真正 ready 再发命令
    lazyConnect: true, // 延迟建连，启动时 Redis 挂了也不立刻炸
  });

  return redisClient; // 返回刚创建的单例
}

/** 关闭 Redis 连接并清空单例，供 SIGINT / SIGTERM 优雅退出。 */
export async function closeRedis(): Promise<void> {
  if (!redisClient) { // 没创建过，或已是 null
    redisClient = undefined; // 重置为未初始化，下次可再 get
    return; // 无需 quit
  }
  await redisClient.quit(); // 发 QUIT，优雅断开
  redisClient = undefined; // 丢掉单例引用
}
