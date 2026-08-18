import { Router } from 'express';

const router: Router = Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is running',
  });
});

export default router;
