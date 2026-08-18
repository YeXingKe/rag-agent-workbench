/**
 * 请求耗时中间件
 *
 * 在响应头写入 X-Process-Time-MS（毫秒，两位小数）。
 * 通过劫持 writeHead，尽量在 headers 发出前注入；流式响应则尽力而为。
 */
import type { NextFunction, Request, Response } from 'express';

/**
 * Express 中间件：统计从进入到写出响应头的耗时。
 */
export function timingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = performance.now();
  res.on('finish', () => {
    const durationMs = performance.now() - startedAt;
    if (!res.headersSent) {
      return;
    }
    try {
      res.setHeader('X-Process-Time-MS', durationMs.toFixed(2));
    } catch {
      // 流式等场景下 headers 可能已发送，忽略写入失败。
    }
  });

  // 在真正 writeHead 前写入耗时，覆盖多数非流式响应
  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = ((...args: Parameters<Response['writeHead']>) => {
    const durationMs = performance.now() - startedAt;
    res.setHeader('X-Process-Time-MS', durationMs.toFixed(2));
    return originalWriteHead(...args);
  }) as Response['writeHead'];

  void req;
  next();
}
