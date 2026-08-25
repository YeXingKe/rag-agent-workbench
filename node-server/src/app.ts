/**
 * Express 应用工厂
 *
 * 装配 CORS、JSON 解析、耗时中间件、根路径 /health，以及 /api/v1 业务路由。
 */
// 跨域资源共享中间件
import cors from 'cors';
// Express 核心及类型定义
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
// 文件上传中间件（错误处理中需识别 MulterError）
import multer from 'multer';

// 业务 API 路由聚合
import apiRouter from './api/index.js';
// 根路径健康检查路由（GET /health）
import healthRouter from './api/health.js';
// 应用配置（CORS 白名单、API 前缀、上传大小限制等）
import { getSettings } from './config/settings.js';
// 请求耗时统计中间件
import { timingMiddleware } from './middleware/timing.js';
// 日志工具
import { logger } from './utils/logger.js';
// 存储层自定义错误（带 HTTP 状态码）
import { StorageError } from './utils/storage.js';

/**
 * 创建并配置 Express 应用实例（不监听端口）。
 *
 * 调用方（main.ts）负责 bootstrap 预热后再 app.listen()。
 */
export function createApp(): Express {
  // 读取环境变量与默认值
  const settings = getSettings();
  // 创建 Express 实例
  const app = express();
  // API 路由前缀：优先 apiV1Prefix，其次 apiPrefix，默认 /api/v1
  const apiPrefix = settings.apiV1Prefix || settings.apiPrefix || '/api/v1';

  // ---------- 全局中间件 ----------

  // CORS：允许前端跨域访问
  app.use(
    cors({
      // 对齐参考 Python：使用配置中的 allowed_origins，而不是无条件 *
      // 未配置时 origin: true 表示反射请求的 Origin
      origin: settings.allowOrigins.length > 0 ? settings.allowOrigins : true,
      // 允许携带 Cookie / Authorization 等凭证
      credentials: true,
      // 允许的 HTTP 方法
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      // 允许任意请求头
      allowedHeaders: ['*'],
    }),
  );
  // JSON 请求体解析，限制 2MB 防止大 payload 拖垮内存
  app.use(express.json({ limit: '2mb' }));
  // URL-encoded 表单解析（extended: true 支持嵌套对象）
  app.use(express.urlencoded({ extended: true }));
  // 记录每个请求的处理耗时
  app.use(timingMiddleware);

  // ---------- 路由挂载 ----------

  // 根路径健康检查（对齐 Python GET /health）
  app.use(healthRouter);
  // 业务 API（对齐 Python prefix=/api/v1）
  app.use(apiPrefix, apiRouter);

  // ---------- 全局错误处理 ----------

  /**
   * 统一错误响应格式：{ detail: string }，与 Python FastAPI 保持一致。
   * 按错误类型依次匹配：StorageError → Multer 文件过大 → 通用错误。
   */
  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    // 响应头已发送时不能再写 body，交给 Express 默认处理
    if (res.headersSent) {
      next(error);
      return;
    }

    // 存储层业务错误：使用错误对象自带的 statusCode
    if (error instanceof StorageError) {
      res.status(error.statusCode).json({ detail: error.message });
      return;
    }

    // Multer 上传文件超过大小限制 → 413 Payload Too Large
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        detail: `File too large, max size is ${settings.maxUploadSizeMb} MB`,
      });
      return;
    }

    // 尝试从错误对象读取 HTTP 状态码，默认 500
    const status =
      typeof error === 'object' && error != null && 'status' in error
        ? Number((error as { status?: unknown }).status) || 500
        : 500;
    // 提取可读错误信息：Error.message → detail 字段 → 兜底文案
    const detail =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error != null && 'detail' in error
          ? String((error as { detail?: unknown }).detail)
          : 'Internal Server Error';

    // 记录服务端日志后返回 JSON 错误体
    logger.error(detail);
    res.status(status).json({ detail });
  });

  return app;
}
