import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabasePool } from './db/pool.js';
import { checkAccountDatabase } from './auth/repository.js';

try {
  const config = loadConfig();
  const database = createDatabasePool(config);
  const server = createApp({ config, database }).listen(config.PORT, config.HOST, () => {
    console.info(`JHaven API 已启动：http://${config.HOST}:${config.PORT}`);
    void checkAccountDatabase(database).then(
      () => console.info('账户数据库已就绪。'),
      () =>
        console.error(
          database
            ? '账户数据库连接失败或迁移未完成。请检查配置与 /api/auth/status。'
            : '账户数据库尚未配置。访客声音库仍可使用。',
        ),
    );
  });
  server.on('error', () => {
    console.error('API 启动失败，请检查监听地址与端口是否可用。');
    process.exitCode = 1;
  });

  let stopping = false;
  function shutdown() {
    if (stopping) return;
    stopping = true;
    server.close(async (error) => {
      if (error) process.exitCode = 1;
      await database?.end().catch(() => {
        process.exitCode = 1;
      });
    });
    setTimeout(() => server.closeAllConnections(), 10_000).unref();
  }
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'API 配置读取失败。');
  process.exitCode = 1;
}
