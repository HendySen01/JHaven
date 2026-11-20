// Vercel 的 Express 构建器从入口的 express 导入识别框架。
import 'express';
import { createApp } from './dist/app.js';
import { loadConfig } from './dist/config.js';
import { createDatabasePool } from './dist/db/pool.js';

const env = process.env;
const local = env.VERCEL_ENV === 'development';
const previewUrl = env.VERCEL_ENV === 'preview' && env.VERCEL_URL;
const config = loadConfig({
  ...env,
  NODE_ENV: local ? 'development' : 'production',
  APP_ORIGIN: env.APP_ORIGIN ?? (previewUrl ? `https://${previewUrl}` : undefined),
});

const app = createApp({ config, database: createDatabasePool(config) });
if (env.VERCEL === '1' && !local) app.set('trust proxy', 1);

export default app;
