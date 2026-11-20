import { credentialsSchema, registrationSchema } from '@jhaven/shared';
import { Router, type CookieOptions, type Request, type RequestHandler } from 'express';
import type { Pool } from 'mysql2/promise';
import { z } from 'zod';
import { AppError } from '../middleware/error-handler.js';
import { sessionCookieName, sessionToken } from './session-cookie.js';
import { hashPassword, verifyPassword } from './password.js';
import { createSpaceRouter } from '../space/routes.js';
import { createRelaxationRouter } from '../space/relaxation.js';
import {
  accountFrom,
  checkAccountDatabase,
  createSession,
  createUser,
  findAccount,
  findCredentials,
  removeSession,
  SESSION_SECONDS,
} from './repository.js';

const empty = z.strictObject({});
const rateWindowMs = 15 * 60 * 1000;

function limitRequests(limit: number): RequestHandler {
  const buckets = new Map<string, { until: number; count: number }>();
  let nextCleanup = 0;
  return (request, response, next) => {
    const timestamp = Date.now();
    if (timestamp >= nextCleanup) {
      for (const [key, entry] of buckets) if (entry.until <= timestamp) buckets.delete(key);
      nextCleanup = timestamp + 60_000;
    }
    const key = request.ip ?? 'unknown';
    const previous = buckets.get(key);
    const bucket =
      previous && previous.until > timestamp
        ? previous
        : { until: timestamp + rateWindowMs, count: 0 };
    if (bucket.count >= limit || (!previous && buckets.size >= 10_000)) {
      response.setHeader('Retry-After', Math.ceil((bucket.until - timestamp) / 1000));
      throw new AppError(429, 'RATE_LIMITED', '尝试次数过多，请稍后再试。');
    }
    bucket.count++;
    buckets.set(key, bucket);
    next();
  };
}

export function createAuthRouter({
  pool,
  origin,
  secure,
}: {
  pool: Pool | undefined;
  origin: string;
  secure: boolean;
}) {
  const router = Router();
  const cookieName = sessionCookieName(secure);
  const cookie: CookieOptions = { httpOnly: true, secure, sameSite: 'lax', path: '/' };
  const requireSameOrigin: RequestHandler = (request, _response, next) => {
    if (request.get('Origin') !== origin || request.get('Sec-Fetch-Site') === 'cross-site') {
      throw new AppError(403, 'INVALID_ORIGIN', '请从本站页面提交账户请求。');
    }
    if (!request.is('application/json'))
      throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', '账户请求须使用 JSON。');
    next();
  };
  function database() {
    if (!pool)
      throw new AppError(503, 'DATABASE_UNAVAILABLE', '账户数据库尚未配置。可以继续使用声音库。');
    return pool;
  }
  function parse<T>(schema: z.ZodType<T>, input: unknown): T {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new AppError(400, 'INVALID_INPUT', '账户请求格式有误，请检查输入。');
    return parsed.data;
  }
  const requireSession: RequestHandler = async (request, response, next) => {
    const token = sessionToken(request, secure);
    const account = token ? await findAccount(database(), token) : null;
    if (!account) throw new AppError(401, 'UNAUTHENTICATED', '请先登录。');
    response.locals.account = account;
    next();
  };
  const requireAccountScope: RequestHandler = (request, response, next) => {
    if (request.get('X-JHaven-Account') !== response.locals.account.id)
      throw new AppError(409, 'ACCOUNT_CHANGED', '账户会话已变化，请刷新后重试。');
    next();
  };

  router.get('/auth/status', async (request, response) => {
    parse(empty, request.query);
    await checkAccountDatabase(pool);
    response.json({ status: 'ok' });
  });
  router.get(['/auth/me', '/account'], requireSession, (request, response) => {
    parse(empty, request.query);
    response.json(response.locals.account);
  });
  router.post('/auth/register', requireSameOrigin, limitRequests(12), async (request, response) => {
    const { username, password } = parse(registrationSchema, request.body);
    const db = database();
    await checkAccountDatabase(db);
    await createUser(db, username, await hashPassword(password));
    response.status(201).json({ username });
  });
  router.post('/auth/login', requireSameOrigin, limitRequests(15), async (request, response) => {
    const { username, password } = parse(credentialsSchema, request.body);
    const db = database();
    const user = await findCredentials(db, username);
    const correct = await verifyPassword(password, user?.password_hash);
    if (!user || !correct) throw new AppError(401, 'INVALID_CREDENTIALS', '用户名或密码不正确。');
    const token = await createSession(db, String(user.id), sessionToken(request, secure));
    response.cookie(cookieName, token, { ...cookie, maxAge: SESSION_SECONDS * 1000 });
    response.json(accountFrom(user));
  });
  router.post('/auth/logout', requireSameOrigin, async (request, response) => {
    parse(empty, request.body);
    const token = sessionToken(request, secure);
    if (token) await removeSession(database(), token);
    response.clearCookie(cookieName, cookie);
    response.status(204).end();
  });
  router.use(
    '/space/relaxation',
    requireSession,
    requireAccountScope,
    createRelaxationRouter(database, requireSameOrigin, limitRequests(120)),
  );
  router.use(
    '/space',
    requireSession,
    requireAccountScope,
    createSpaceRouter(database, requireSameOrigin, limitRequests(120)),
  );
  // 已知数据库接入故障使用一致响应，不把驱动、SQL 或凭据传给客户端。
  router.use(
    (error: unknown, _request: Request, _response: unknown, next: (error: unknown) => void) => {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      if (
        !(error instanceof AppError) &&
        /^(ER_|ECONN|ETIMEDOUT|EHOST|ENOTFOUND|PROTOCOL_|HANDSHAKE_|CERT_|POOL_)/.test(code)
      ) {
        next(new AppError(503, 'DATABASE_UNAVAILABLE', '账户数据库暂不可用，请稍后重试。'));
        return;
      }
      next(error);
    },
  );
  return router;
}
