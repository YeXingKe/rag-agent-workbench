/**
 * API 路由聚合入口。
 *
 * 将健康检查、文档、Chunk、检索、对话等子路由挂载到统一 apiRouter，
 * 供 app.ts 一次性注册。
 */

import { Router } from 'express';

import chatRouter from './chat.js';
import chunksRouter from './chunks.js';
import documentsRouter from './documents.js';
import healthRouter from './health.js';
import retrievalRouter from './retrieval.js';

const apiRouter: Router = Router();

/** GET /health — 健康检查（无前缀挂载） */
apiRouter.use(healthRouter);
/** /documents — 文档入库、列表、重建与删除 */
apiRouter.use('/documents', documentsRouter);
/** /chunks — Chunk 列表、详情、编辑与删除 */
apiRouter.use('/chunks', chunksRouter);
/** /retrieval — 知识库检索调试接口 */
apiRouter.use('/retrieval', retrievalRouter);
/** /chat — Agent 问答、会话历史与清空 */
apiRouter.use('/chat', chatRouter);

export default apiRouter;
