import { createHash, randomBytes } from 'node:crypto';
import type { Account } from '@jhaven/shared';
import type { Pool } from 'pg';
import { inTransaction } from '../db/pool.js';
import { AppError } from '../middleware/error-handler.js';

interface UserRow {
  id: string;
  username: string;
  created_at: Date;
}
interface CredentialRow extends UserRow {
  password_hash: string;
}

export const SESSION_SECONDS = 7 * 24 * 60 * 60;
const tokenHash = (token: string) => createHash('sha256').update(token).digest();
export const accountFrom = (row: UserRow): Account => ({
  id: String(row.id),
  username: row.username,
  createdAt: row.created_at.toISOString(),
});

export async function checkAccountDatabase(pool?: Pool) {
  if (!pool)
    throw new AppError(503, 'DATABASE_UNAVAILABLE', '账户数据库尚未配置。可以继续使用声音库。');
  try {
    await pool.query(
      'SELECT u.id, u.password_hash, s.token_hash FROM jhaven.users u JOIN jhaven.auth_sessions s ON s.user_id = u.id LIMIT 0',
    );
  } catch {
    throw new AppError(503, 'DATABASE_UNAVAILABLE', '账户数据库连接失败或迁移未完成，请稍后重试。');
  }
}

export async function createUser(pool: Pool, username: string, passwordHash: string) {
  try {
    await pool.query(
      'INSERT INTO jhaven.users (username, password_hash, created_at, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [username, passwordHash],
    );
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === '23505') {
      throw new AppError(409, 'USERNAME_UNAVAILABLE', '无法使用此用户名注册，请尝试其他名称。');
    }
    throw error;
  }
}

export async function findCredentials(pool: Pool, username: string) {
  const { rows } = await pool.query<CredentialRow>(
    'SELECT id, username, password_hash, created_at FROM jhaven.users WHERE username = $1 LIMIT 1',
    [username],
  );
  return rows[0];
}

export async function createSession(pool: Pool, userId: string, previous?: string) {
  const token = randomBytes(32).toString('base64url');
  await pool.query(`DELETE FROM jhaven.auth_sessions WHERE token_hash IN (
    SELECT token_hash FROM jhaven.auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP
    ORDER BY expires_at, token_hash LIMIT 200
  )`);
  await inTransaction(pool, async (connection) => {
    if (previous)
      await connection.query('DELETE FROM jhaven.auth_sessions WHERE token_hash = $1', [
        tokenHash(previous),
      ]);
    await connection.query(
      `INSERT INTO jhaven.auth_sessions (token_hash, user_id, created_at, expires_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + $3::integer * INTERVAL '1 second')`,
      [tokenHash(token), userId, SESSION_SECONDS],
    );
  });
  return token;
}

export async function findAccount(pool: Pool, token: string) {
  const { rows } = await pool.query<UserRow>(
    `SELECT u.id, u.username, u.created_at
    FROM jhaven.auth_sessions s JOIN jhaven.users u ON s.user_id = u.id
    WHERE s.token_hash = $1 AND s.expires_at > CURRENT_TIMESTAMP LIMIT 1`,
    [tokenHash(token)],
  );
  return rows[0] ? accountFrom(rows[0]) : null;
}

export async function removeSession(pool: Pool, token: string) {
  await pool.query('DELETE FROM jhaven.auth_sessions WHERE token_hash = $1', [tokenHash(token)]);
}
