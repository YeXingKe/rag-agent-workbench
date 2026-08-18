/**
 * Express 应用工厂
 *
 * 装配 CORS、JSON 解析、耗时中间件、API 路由，以及统一错误处理
 *（含 StorageError / multer 超限等）。
 */
import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';

import apiRouter from './api/index.js';
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

  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['*'],
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(timingMiddleware);
  app.use(settings.apiPrefix || '/api', apiRouter);

  // 统一错误处理：已写出响应则交给默认 handler
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
