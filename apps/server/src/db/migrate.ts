import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import { loadConfig } from '../config.js';
import { createMigrationPool, inTransaction } from './pool.js';

export async function migrate(pool: Pool) {
  const directory = new URL('../../migrations-postgres/', import.meta.url);
  const files = (await readdir(directory))
    .filter((name) => /^\d{3}_[a-z_]+\.sql$/.test(name))
    .sort();
  const sources = await Promise.all(
    files.map(async (name) => {
      const sql = (await readFile(new URL(name, directory), 'utf8')).replaceAll('\r\n', '\n');
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    }),
  );
  if (!files.length) throw new Error('未找到 PostgreSQL 迁移。');
  const applied = await inTransaction(pool, async (client) => {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('jhaven.schema_migrations'))");
    const { rows: schemas } = await client.query(
      "SELECT 1 FROM pg_namespace WHERE nspname = 'jhaven'",
    );
    if (!schemas.length) await client.query('CREATE SCHEMA jhaven');
    await client.query('REVOKE ALL ON SCHEMA jhaven FROM PUBLIC');
    await client.query(`CREATE TABLE IF NOT EXISTS jhaven.schema_migrations (
      name varchar(100) PRIMARY KEY,
      checksum char(64) NOT NULL,
      applied_at timestamptz(3) NOT NULL
    )`);
    const { rows } = await client.query<{ name: string; checksum: string }>(
      'SELECT name, checksum FROM jhaven.schema_migrations ORDER BY name',
    );
    // 历史须为当前文件序列的完整前缀，且每条内容与原始版本相同。
    if (
      rows.some(
        (row, index) =>
          row.name !== sources[index]?.name || row.checksum !== sources[index]?.checksum,
      )
    )
      throw new Error('已应用迁移的版本序列或校验和不匹配。');
    const pending = sources.slice(rows.length);
    for (const { name, sql, checksum } of pending) {
      await client.query(sql);
      await client.query(
        'INSERT INTO jhaven.schema_migrations (name, checksum, applied_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
        [name, checksum],
      );
    }
    return pending.map(({ name }) => name);
  });
  for (const name of applied) console.info(`已应用 PostgreSQL 迁移 ${name}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pool: Pool | undefined;
  try {
    pool = createMigrationPool(loadConfig());
    await migrate(pool);
    console.info('PostgreSQL 迁移核验完成。');
  } catch {
    console.error('数据库迁移失败。请检查迁移连接、CA、角色权限及已应用迁移的校验和。');
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
