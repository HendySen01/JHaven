// Vercel 在执行构建命令后，若 dist、build 或 output 中存在名为 app.js 且导入 express 的文件，
// 会把该目录当作函数根目录。tsc 产物没有 package.json，Node 会按 CommonJS 解析 ESM。
// 本文件是服务根目录的唯一 Express 默认导出；构建命令只编译共享包，由 Vercel 按 type=module 编译本文件。
import 'express';
import { createApp } from './src/app.js';
import { loadConfig } from './src/config.js';
import { createDatabasePool } from './src/db/pool.js';

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
