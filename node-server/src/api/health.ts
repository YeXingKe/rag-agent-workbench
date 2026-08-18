/**
 * 健康检查路由。
 *
 * 提供最简存活探针，供负载均衡 / 运维探活使用。
 */

import { Router } from 'express';

const router: Router = Router();

/**
 * GET /health
 * 返回服务存活状态。
 */
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is running',
  });
});

export default router;
