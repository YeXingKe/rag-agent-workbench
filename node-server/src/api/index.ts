import { Router } from 'express';

import chatRouter from './chat.js';
import chunksRouter from './chunks.js';
import documentsRouter from './documents.js';
import healthRouter from './health.js';
import retrievalRouter from './retrieval.js';

const apiRouter: Router = Router();

apiRouter.use(healthRouter);
apiRouter.use('/documents', documentsRouter);
apiRouter.use('/chunks', chunksRouter);
apiRouter.use('/retrieval', retrievalRouter);
apiRouter.use('/chat', chatRouter);

export default apiRouter;
