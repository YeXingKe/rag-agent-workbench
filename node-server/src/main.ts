/**
 * HTTP 服务入口
 *
 * 配置日志 → 预热单例 → 创建 Express 并监听 APP_HOST / APP_PORT。
 */
import { createApp } from './app.js';
import { warmUpSingletons } from './bootstrap.js';
import { getSettings } from './config/settings.js';
import { shutdownCheckpointer } from './agent/memory.js';
import { closePool } from './core/postgres.js';
import { closeRedis } from './core/redis.js';
import { configureLogging, logger } from './utils/logger.js';

configureLogging();

const settings = getSettings();
const host = settings.appHost || '0.0.0.0';
const port = Number(settings.appPort || 8000);
const apiPrefix = settings.apiV1Prefix || settings.apiPrefix || '/api/v1';

async function main(): Promise<void> {
  try {
    await warmUpSingletons();
  } catch (error) {
    // 预热失败不阻断启动（对齐 Python：不在启动阶段强制探测远端依赖）
    logger.warn(`Warm-up failed (server still starts): ${error instanceof Error ? error.message : String(error)}`);
  }

  const app = createApp();
  const server = app.listen(port, host, () => {
    logger.info(`Application started: ${settings.appName} (${settings.appEnv})`);
    logger.info(`listening on http://${host}:${port}`);
    logger.info(`API prefix: ${apiPrefix}`);
    logger.info(`Health: GET http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/health`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    shutdownCheckpointer();
    try {
      await closeRedis();
    } catch {
      // ignore
    }
    try {
      await closePool();
    } catch {
      // ignore
    }
    server.close(() => {
      logger.info(`Application stopped: ${settings.appName}`);
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
