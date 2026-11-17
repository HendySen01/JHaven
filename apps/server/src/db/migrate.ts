import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { loadConfig } from '../config.js';
import { createDatabasePool } from './pool.js';

export async function migrate(pool: Pool) {
  const directory = new URL('../../migrations/', import.meta.url);
  const files = (await readdir(directory))
    .filter((name) => /^\d{3}_[a-z_]+\.sql$/.test(name))
    .sort();
  const connection = await pool.getConnection();
  let locked = false;
  try {
    const [locks] = await connection.execute<RowDataPacket[]>(
      "SELECT GET_LOCK(CONCAT('jhaven:', LEFT(SHA2(DATABASE(), 256), 48)), 10) AS acquired",
    );
    locked = Number(locks[0]?.acquired) === 1;
    if (!locked) throw new Error('无法获取数据库迁移锁。');
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      applied_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB`);
    const [existing] = await connection.execute<RowDataPacket[]>(
      'SELECT name, checksum FROM schema_migrations',
    );
    if (existing.some(({ name }) => !files.includes(String(name))))
      throw new Error('数据库含有本版本未知的迁移。');
    for (const file of files) {
      const sql = (await readFile(new URL(file, directory), 'utf8')).replaceAll('\r\n', '\n');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const known = existing.find(({ name }) => name === file);
      if (known) {
        if (known.checksum !== checksum) throw new Error('已执行的迁移文件内容发生变化。');
        continue;
      }
      await connection.query(sql);
      await connection.execute(
        'INSERT INTO schema_migrations (name, checksum, applied_at) VALUES (?, ?, UTC_TIMESTAMP(3))',
        [file, checksum],
      );
      console.info(`已应用数据库迁移 ${file}`);
    }
  } finally {
    try {
      if (locked)
        await connection.execute(
          "SELECT RELEASE_LOCK(CONCAT('jhaven:', LEFT(SHA2(DATABASE(), 256), 48)))",
        );
    } finally {
      connection.release();
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pool: Pool | undefined;
  try {
    pool = createDatabasePool(loadConfig());
    if (!pool) throw new Error('尚未配置数据库。');
    await migrate(pool);
    console.info('数据库迁移核验完成。');
  } catch {
    console.error('数据库迁移失败。请检查数据库连接、迁移账号权限和已应用的迁移记录。');
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
