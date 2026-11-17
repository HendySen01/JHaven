import { createApp } from './app.js';
import { loadConfig } from './config.js';

try {
  const config = loadConfig();
  const server = createApp().listen(config.PORT, config.HOST, () => {
    console.info(`JHaven API 已启动：http://${config.HOST}:${config.PORT}`);
  });
  server.on('error', () => {
    console.error('API 启动失败，请检查监听地址与端口是否可用。');
    process.exitCode = 1;
  });

  let stopping = false;
  function shutdown() {
    if (stopping) return;
    stopping = true;
    server.close((error) => {
      if (error) process.exitCode = 1;
    });
    setTimeout(() => server.closeAllConnections(), 10_000).unref();
  }
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'API 配置读取失败。');
  process.exitCode = 1;
}
