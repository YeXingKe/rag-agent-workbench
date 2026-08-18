/**
 * Express 应用工厂
 *
 * 装配 CORS、JSON 解析、耗时中间件、根路径 /health，以及 /api/v1 业务路由。
 */
import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';

import apiRouter from './api/index.js';
import healthRouter from './api/health.js';
import { getSettings } from './config/settings.js';
import { timingMiddleware } from './middleware/timing.js';
import { logger } from './utils/logger.js';
import { StorageError } from './utils/storage.js';

/**
 * 创建并配置 Express 应用实例（不监听端口）。
 */
export function createApp(): Express {
  const settings = getSettings();
  const app = express();
  const apiPrefix = settings.apiV1Prefix || settings.apiPrefix || '/api/v1';

  app.use(
    cors({
      // 对齐参考 Python：使用配置中的 allowed_origins，而不是无条件 *
      origin: settings.allowOrigins.length > 0 ? settings.allowOrigins : true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['*'],
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(timingMiddleware);

  // 根路径健康检查（对齐 Python GET /health）
  app.use(healthRouter);
  // 业务 API（对齐 Python prefix=/api/v1）
  app.use(apiPrefix, apiRouter);

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    if (error instanceof StorageError) {
      res.status(error.statusCode).json({ detail: error.message });
      return;
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        detail: `File too large, max size is ${settings.maxUploadSizeMb} MB`,
      });
      return;
    }

    const status =
      typeof error === 'object' && error != null && 'status' in error
        ? Number((error as { status?: unknown }).status) || 500
        : 500;
    const detail =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error != null && 'detail' in error
          ? String((error as { detail?: unknown }).detail)
          : 'Internal Server Error';

    logger.error(detail);
    res.status(status).json({ detail });
  });

  return app;
}
