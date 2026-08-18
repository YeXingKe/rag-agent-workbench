/**
 * API 路由聚合入口。
 *
 * 业务路由挂载在 /api/v1 下（对齐参考 Python：api_v1_prefix）。
 * 健康检查单独挂在根路径 /health，见 app.ts。
 */

import { Router } from 'express';

import chatRouter from './chat.js';
import chunksRouter from './chunks.js';
import documentsRouter from './documents.js';
import retrievalRouter from './retrieval.js';

const apiRouter: Router = Router();

/** /documents — 文档入库、列表、重建与删除 */
apiRouter.use('/documents', documentsRouter);
/** /chunks — Chunk 列表、详情、编辑与删除 */
apiRouter.use('/chunks', chunksRouter);
/** /retrieval — 知识库检索调试接口 */
apiRouter.use('/retrieval', retrievalRouter);
/** /chat — Agent 问答、会话历史与清空 */
apiRouter.use('/chat', chatRouter);

export default apiRouter;
