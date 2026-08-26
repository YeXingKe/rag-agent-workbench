/**
 * 健康检查路由与依赖探测。
 *
 * 对齐参考 Python 服务：根路径 GET /health，返回 postgres / redis / milvus 明细。
 */

import { Router, type Request, type Response } from 'express';

import { probeMilvusHealth } from '../core/milvus.js';
import { getPool } from '../core/postgres.js';
import { getRedisClient } from '../core/redis.js';
import type { HealthResponse, ServiceHealthItem } from '../schemas/common.js';
import { logger } from '../utils/logger.js';

const router: Router = Router();

/**
 * 汇总基础依赖健康状态（可复用于探活、CLI 自检）。
 */
export async function buildHealthResponse(): Promise<HealthResponse> {
  let postgresOk = false;
  let redisOk = false;
  let milvusOk = false;
  let postgresError: string | null = null;
  let redisError: string | null = null;
  let milvusError: string | null = null;

  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    postgresOk = true;
  } catch (error) {
    postgresError = error instanceof Error ? error.message : String(error);
  }

  try {
    const redis = getRedisClient();
    if (!redis) {
      redisError = 'REDIS_URL is not configured';
    } else {
      if (redis.status === 'wait') {
        await redis.connect();
      }
      const pong = await redis.ping();
      redisOk = pong === 'PONG' || pong === 'pong' || Boolean(pong);
    }
  } catch (error) {
    redisError = error instanceof Error ? error.message : String(error);
  }

  try {
    const result = await probeMilvusHealth();
    milvusOk = result.ok;
    milvusError = result.error;
  } catch (error) {
    milvusError = error instanceof Error ? error.message : String(error);
  }

  const services: Record<string, ServiceHealthItem> = {
    postgres: { ok: postgresOk, error: postgresError },
    redis: { ok: redisOk, error: redisError },
    milvus: { ok: milvusOk, error: milvusError },
  };

  return {
    ok: postgresOk && redisOk && milvusOk,
    services,
  };
}

/**
 * GET /health
 * 返回 PostgreSQL、Redis、Milvus 的健康状态。
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const body = await buildHealthResponse();
    res.json(body);
  } catch (error) {
    logger.error(`health check failed: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({
      ok: false,
      services: {},
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
