import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { AppError } from '../middleware/error-handler.js';

const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const dummyHash = `scrypt-v1$${randomBytes(16).toString('hex')}$${randomBytes(32).toString('hex')}`;
const format = /^scrypt-v1\$([a-f0-9]{32})\$([a-f0-9]{64})$/;
let running = 0;

async function derive(password: string, salt: Buffer) {
  if (running >= 4) throw new AppError(429, 'AUTH_BUSY', '认证请求较多，请稍后重试。');
  running++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 32, options, (error, key) => (error ? reject(error) : resolve(key)));
    });
  } finally {
    running--;
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt-v1$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, saved: string | undefined) {
  const stored = saved ? format.exec(saved) : null;
  const [, salt, key] = stored ?? format.exec(dummyHash)!;
  const actual = await derive(password, Buffer.from(salt!, 'hex'));
  const matches = timingSafeEqual(actual, Buffer.from(key!, 'hex'));
  return Boolean(stored && matches);
}
