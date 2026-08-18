/**
 * Redis 客户端封装
 *
 * 按 REDIS_URL 懒创建连接；未配置时返回 null，调用方需自行降级。
 */
import { Redis } from 'ioredis';

import { getSettings } from '../config/settings.js';

/** undefined = 尚未初始化；null = 明确未配置 Redis。 */
let redisClient: Redis | null | undefined;

/**
 * 获取 Redis 客户端（懒连接单例）。
 *
 * @returns 已配置时返回 ioredis 实例；未配置 REDIS_URL 时返回 null
 */
export function getRedisClient(): Redis | null {
  if (redisClient !== undefined) {
    return redisClient;
  }

  const redisUrl = getSettings().redisUrl;
  if (!redisUrl) {
    redisClient = null;
    return null;
  }

  redisClient = new Redis(redisUrl, {
    connectTimeout: 5_000,
    commandTimeout: 5_000,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    // 延迟建连，避免启动阶段强依赖 Redis 可用性
    lazyConnect: true,
  });

  return redisClient;
}

/** 关闭 Redis 连接并清空单例，便于进程优雅退出。 */
export async function closeRedis(): Promise<void> {
  if (!redisClient) {
    redisClient = undefined;
    return;
  }
  await redisClient.quit();
  redisClient = undefined;
}
