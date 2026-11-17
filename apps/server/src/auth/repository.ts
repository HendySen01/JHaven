import { createHash, randomBytes } from 'node:crypto';
import type { Account } from '@jhaven/shared';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { AppError } from '../middleware/error-handler.js';

interface UserRow extends RowDataPacket {
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
    await pool.execute(
      'SELECT u.id, u.password_hash, s.token_hash FROM users u JOIN auth_sessions s ON s.user_id = u.id LIMIT 0',
    );
  } catch {
    throw new AppError(503, 'DATABASE_UNAVAILABLE', '账户数据库连接失败或迁移未完成，请稍后重试。');
  }
}

export async function createUser(pool: Pool, username: string, passwordHash: string) {
  try {
    await pool.execute(
      'INSERT INTO users (username, password_hash, created_at, updated_at) VALUES (?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))',
      [username, passwordHash],
    );
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'ER_DUP_ENTRY') {
      throw new AppError(409, 'USERNAME_UNAVAILABLE', '无法使用此用户名注册，请尝试其他名称。');
    }
    throw error;
  }
}

export async function findCredentials(pool: Pool, username: string) {
  const [rows] = await pool.execute<CredentialRow[]>(
    'SELECT id, username, password_hash, created_at FROM users WHERE username = ? LIMIT 1',
    [username],
  );
  return rows[0];
}

export async function createSession(pool: Pool, userId: string, previous?: string) {
  const token = randomBytes(32).toString('base64url');
  await pool.execute('DELETE FROM auth_sessions WHERE expires_at <= UTC_TIMESTAMP(3) LIMIT 200');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (previous)
      await connection.execute('DELETE FROM auth_sessions WHERE token_hash = ?', [
        tokenHash(previous),
      ]);
    await connection.execute(
      'INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, UTC_TIMESTAMP(3), TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP(3)))',
      [tokenHash(token), userId, SESSION_SECONDS],
    );
    await connection.commit();
    return token;
  } catch (error) {
    await connection.rollback().catch(() => connection.destroy());
    throw error;
  } finally {
    connection.release();
  }
}

export async function findAccount(pool: Pool, token: string) {
  const [rows] = await pool.execute<UserRow[]>(
    `SELECT u.id, u.username, u.created_at
    FROM auth_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3) LIMIT 1`,
    [tokenHash(token)],
  );
  return rows[0] ? accountFrom(rows[0]) : null;
}

export async function removeSession(pool: Pool, token: string) {
  await pool.execute('DELETE FROM auth_sessions WHERE token_hash = ?', [tokenHash(token)]);
}
