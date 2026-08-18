/**
 * HTTP 服务入口
 *
 * 配置日志后创建 Express 应用并监听 APP_HOST / APP_PORT。
 */
import { createApp } from './app.js';
import { getSettings } from './config/settings.js';
import { configureLogging, logger } from './utils/logger.js';

configureLogging();

const settings = getSettings();
const app = createApp();
const host = settings.appHost || '0.0.0.0';
const port = Number(settings.appPort || 8000);

app.listen(port, host, () => {
  logger.info(`${settings.appName} listening on http://${host}:${port}`);
  logger.info(`API prefix: ${settings.apiPrefix || '/api'}`);
});
