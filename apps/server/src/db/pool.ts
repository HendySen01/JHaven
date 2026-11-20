import pg, { type Pool, type PoolClient } from 'pg';
import type { Config } from '../config.js';

function poolFor(connectionString: string, ca: string): Pool {
  const pool = new pg.Pool({
    connectionString,
    ssl: { ca, minVersion: 'TLSv1.2', rejectUnauthorized: true },
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  });
  pool.on('error', () => console.error('空闲数据库连接已失效。'));
  return pool;
}

export function createDatabasePool(config: Config) {
  if (config.DATABASE_URL && config.DATABASE_CA_PEM)
    return poolFor(config.DATABASE_URL, config.DATABASE_CA_PEM);
}

export function createMigrationPool(config: Config) {
  if (!config.MIGRATION_DATABASE_URL || !config.DATABASE_CA_PEM)
    throw new Error('须单独配置迁移数据库连接和 CA。');
  const url = new URL(config.MIGRATION_DATABASE_URL);
  if (url.port === '6543') throw new Error('迁移须使用直连或 Session pooler。');
  const role = (endpoint: URL) => {
    const username = decodeURIComponent(endpoint.username);
    return endpoint.hostname.endsWith('.pooler.supabase.com') ? username.split('.')[0] : username;
  };
  if (config.DATABASE_URL && role(new URL(config.DATABASE_URL)) === role(url))
    throw new Error('运行与迁移须使用不同数据库角色。');
  return poolFor(config.MIGRATION_DATABASE_URL, config.DATABASE_CA_PEM);
}

export async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  let destroy = false;
  try {
    await client.query('BEGIN');
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      destroy = true;
    }
    throw error;
  } finally {
    client.release(destroy);
  }
}
