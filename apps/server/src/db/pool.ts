import { createPool } from 'mysql2';
import type { Config } from '../config.js';

export function createDatabasePool(config: Config) {
  if (!config.DB_HOST || !config.DB_USER || !config.DB_NAME || config.DB_PASSWORD === undefined)
    return undefined;
  const pool = createPool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    timezone: 'Z',
    supportBigNumbers: true,
    bigNumberStrings: true,
    connectionLimit: 8,
    queueLimit: 24,
    connectTimeout: 3000,
    ...(config.DB_TLS === '1'
      ? { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true, verifyIdentity: true } }
      : {}),
  });
  pool.on('connection', (connection) => {
    connection.query("SET SESSION time_zone = '+00:00'", (error) => {
      if (error) connection.destroy();
    });
  });
  return pool.promise();
}
