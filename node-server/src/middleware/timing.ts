import type { NextFunction, Request, Response } from 'express';

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
      // Headers may already be sent for streaming responses.
    }
  });

  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = ((...args: Parameters<Response['writeHead']>) => {
    const durationMs = performance.now() - startedAt;
    res.setHeader('X-Process-Time-MS', durationMs.toFixed(2));
    return originalWriteHead(...args);
  }) as Response['writeHead'];

  void req;
  next();
}
