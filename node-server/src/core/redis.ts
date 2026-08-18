import { Redis } from 'ioredis';

import { getSettings } from '../config/settings.js';

let redisClient: Redis | null | undefined;

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
    lazyConnect: true,
  });

  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (!redisClient) {
    redisClient = undefined;
    return;
  }
  await redisClient.quit();
  redisClient = undefined;
}
