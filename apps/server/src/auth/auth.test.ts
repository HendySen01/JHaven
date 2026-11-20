import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { RowDataPacket } from 'mysql2/promise';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createDatabasePool } from '../db/pool.js';
import { migrate } from '../db/migrate.js';
import { hashPassword, verifyPassword } from './password.js';
import { TRACK_IDS } from '@jhaven/shared';

const origin = 'http://127.0.0.1:5173';
const randomName = () => `test_${randomBytes(8).toString('hex')}`;
const password = '这是临时账户的演示口令 78';

function cookieFrom(response: { headers: Record<string, unknown> }) {
  const cookies = response.headers['set-cookie'] as string[];
  return cookies[0]!.split(';')[0]!;
}

describe('无数据库时的账户和边界行为', () => {
  const client = request(createApp());
  it('访客服务可用，账户就绪与未认证错误单独报告', async () => {
    await client.get('/api/health').expect(200);
    await client
      .get('/api/auth/status')
      .expect(503)
      .expect(({ body }) => expect(body.error.code).toBe('DATABASE_UNAVAILABLE'));
    await client.get('/api/account').expect(401);
    await client
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ username: randomName(), password })
      .expect(503);
  });
  it('拒绝缺失、外站及同源前缀相似的 Origin', async () => {
    for (const header of ['', 'https://outside.example', `${origin}.invalid`]) {
      const call = client.post('/api/auth/logout');
      if (header) call.set('Origin', header);
      await call.send({}).expect(403);
    }
    await client
      .post('/api/auth/logout')
      .set('Origin', origin)
      .type('form')
      .send('ignored=1')
      .expect(415);
  });
  it('拒绝不完整数据库配置及 HTTP 生产 Origin', () => {
    expect(() => loadConfig({ DB_HOST: '127.0.0.1' })).toThrow('数据库配置不完整');
    expect(() => loadConfig({ NODE_ENV: 'production', APP_ORIGIN: origin })).toThrow('HTTPS');
    expect(() => loadConfig({ APP_ORIGIN: `${origin}/other` })).toThrow('无路径');
  });
  it('独立随机盐，误密码和不存在账户均不验证通过', async () => {
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    await expect(verifyPassword(password, first)).resolves.toBe(true);
    await expect(verifyPassword(`${password}x`, first)).resolves.toBe(false);
    await expect(verifyPassword(password, undefined)).resolves.toBe(false);
  });
  it('认证端点限流并提供重试时间', async () => {
    const api = request(createApp());
    for (let n = 0; n < 15; n++)
      await api.post('/api/auth/login').set('Origin', origin).send({}).expect(400);
    const response = await api.post('/api/auth/login').set('Origin', origin).send({}).expect(429);
    expect(response.headers['retry-after']).toBeDefined();
    expect(response.body.error.code).toBe('RATE_LIMITED');
  });
});

const integration = process.env.JHAVEN_TEST_MYSQL === '1' ? describe : describe.skip;
integration('真实 MySQL 账户集成', () => {
  const names: string[] = [];
  let config: ReturnType<typeof loadConfig>;
  let pool: NonNullable<ReturnType<typeof createDatabasePool>>;
  let app: ReturnType<typeof createApp>;
  beforeAll(async () => {
    config = loadConfig({ ...process.env, APP_ORIGIN: origin, NODE_ENV: 'test' });
    if (!config.DB_NAME?.startsWith('jhaven_test_'))
      throw new Error('仅允许对 jhaven_test_ 前缀的隔离库运行写入测试。');
    pool = createDatabasePool(config)!;
    await migrate(pool);
    app = createApp({ config, database: pool });
  });
  afterAll(async () => {
    if (!pool) return;
    try {
      for (const name of names) await pool.execute('DELETE FROM users WHERE username = ?', [name]);
    } finally {
      await pool.end();
    }
  });

  async function register(api = request(app), siteOrigin = origin) {
    const username = randomName();
    names.push(username);
    await api
      .post('/api/auth/register')
      .set('Origin', siteOrigin)
      .send({ username: username.toUpperCase(), password })
      .expect(201)
      .expect(({ body }) => expect(body).toEqual({ username }));
    return username;
  }
  function login(username: string, secret = password, api = request(app), siteOrigin = origin) {
    return api
      .post('/api/auth/login')
      .set('Origin', siteOrigin)
      .send({ username, password: secret });
  }
  it('助手用真实登录会话区分同网络的两个账户', async () => {
    const api = request(
      createApp({
        database: pool,
        assistantProvider: {
          name: 'deepseek',
          async choose(_text, _signal, _system, _detail, report) {
            report?.({ prompt_tokens: 500, completion_tokens: 30 });
            return { kind: 'chat', text: '今晚过得怎么样？' };
          },
        },
      }),
    );
    const firstUser = await register(api);
    const first = await login(firstUser, password, api).expect(200);
    const second = await login(await register(api), password, api).expect(200);
    const chat = (cookie: string, mode: 'ai' | 'local' = 'ai') =>
      api
        .post('/api/assistant/chat')
        .set({ Cookie: cookie, Origin: origin })
        .send({ mode, ...(mode === 'ai' ? { provider: 'deepseek' } : {}), messages: ['你好呀'] });
    for (let n = 0; n < 60; n++) await chat(cookieFrom(first)).expect(200);
    await chat(cookieFrom(first))
      .expect(429)
      .expect(({ body }) => expect(body.error.code).toBe('ASSISTANT_LIMIT'));
    await chat(cookieFrom(second)).expect(200);
    await chat(cookieFrom(first), 'local').expect(200);
  });
  it('练习记录严格校验、按账户隔离、支持重试与删除', async () => {
    const api = request(app);
    const url = '/api/space/relaxation';
    const firstUser = await register(api);
    const first = await login(firstUser).expect(200);
    const second = await login(await register(api)).expect(200);
    const record = { id: randomUUID(), practice: 'body', seconds: 42, completed: false };
    const headers = (session: typeof first) => ({
      Cookie: cookieFrom(session),
      'X-JHaven-Account': session.body.id,
      Origin: origin,
    });
    await api.get(url).expect(401);
    await api
      .post(url)
      .set(headers(first))
      .set('Origin', 'https://other.example')
      .send(record)
      .expect(403);
    await api
      .post(url)
      .set(headers(first))
      .send({ ...record, mood: 'private' })
      .expect(400);
    await api.get(url).set(headers(second)).set('X-JHaven-Account', first.body.id).expect(409);
    await api.post(url).set(headers(first)).send(record).expect(201);
    await api.post(url).set(headers(first)).send(record).expect(200);
    await api
      .post(url)
      .set(headers(first))
      .send({ ...record, seconds: 50 })
      .expect(409);
    await api.get(url).set(headers(second)).expect(200, []);
    await api
      .delete(url + '/' + record.id)
      .set(headers(second))
      .send({})
      .expect(404);
    const restored = await login(firstUser).expect(200);
    const result = await api.get(url).set(headers(restored)).expect(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body).toEqual([{ ...record, createdAt: expect.stringMatching(/Z$/) }]);
    await api
      .delete(url + '/' + record.id)
      .set(headers(restored))
      .send({})
      .expect(204);
    await api.get(url).set(headers(restored)).expect(200, []);
  });
  it('私人空间验证归属、拒绝同名覆盖，并跨登录保存日记与默认设置', async () => {
    const api = request(app);
    const a = await register(api);
    const b = await register(api);
    const first = await login(a, password, api).expect(200);
    const second = await login(b, password, api).expect(200);
    const bind = (response: typeof first) => ({
      Cookie: cookieFrom(response),
      'X-JHaven-Account': String(response.body.id),
      Origin: origin,
    });
    const owner = bind(first);
    const stranger = bind(second);
    const preset = {
      name: '静夜',
      mix: Object.fromEntries(TRACK_IDS.map((id) => [id, { enabled: id === 'rain', volume: 32 }])),
    };
    await api.get('/api/space').expect(401);
    await api
      .get('/api/space')
      .set({ ...stranger, 'X-JHaven-Account': owner['X-JHaven-Account'] })
      .expect(409);
    await api
      .post('/api/space/presets')
      .set({ ...owner, Origin: 'https://outside.example' })
      .send(preset)
      .expect(403);
    await api
      .post('/api/space/presets')
      .set(owner)
      .send({ ...preset, user_id: second.body.id })
      .expect(400);
    const { body: created } = await api
      .post('/api/space/presets')
      .set(owner)
      .send(preset)
      .expect(201);
    await api
      .post('/api/space/presets')
      .set(owner)
      .send({ ...preset, mix: { ...preset.mix, rain: { enabled: true, volume: 99 } } })
      .expect(409);
    const presetUrl = '/api/space/presets/' + created.id;
    const settings = { scene: { kind: 'preset', id: created.id }, volume: 29, timerMinutes: 30 };
    await api.put('/api/space/preferences').set(stranger).send(settings).expect(404);
    await api.put(presetUrl).set(stranger).send(preset).expect(404);
    await api.delete(presetUrl).set(stranger).send({}).expect(404);
    await api.put('/api/space/preferences').set(owner).send(settings).expect(200);
    await api
      .get('/api/space')
      .set(owner)
      .expect(200, { presets: [created], preferences: settings });
    const changed = { ...preset, name: '轻雨' };
    await api.put(presetUrl).set(owner).send(changed).expect(200);
    await api.put(presetUrl).set(owner).send(changed).expect(200);

    const date = '2026-11-12';
    const query = '/api/space/diary?from=2026-11-10&to=2026-11-13';
    const diary = {
      date,
      timezone: 'Asia/Macau',
      bedtime: '2026-11-12T15:30:00Z',
      asleep: null,
      wake: '2026-11-12T23:00:00Z',
      rest: 4,
      note: '临时测试内容',
    };
    await api
      .post('/api/space/diary')
      .set(owner)
      .send({ ...diary, timezone: 'Unknown/Place' })
      .expect(400);
    await api
      .post('/api/space/diary')
      .set(owner)
      .send({ ...diary, wake: '2026-11-12T12:30:00Z' })
      .expect(400);
    const { body: entry } = await api.post('/api/space/diary').set(owner).send(diary).expect(201);
    const diaryUrl = '/api/space/diary/' + entry.id;
    await api.post('/api/space/diary').set(owner).send(diary).expect(409);
    await api.get(query).set(owner).expect(200, [entry]);
    await api.get('/api/space/diary?from=2026-11-13&to=2026-11-13').set(owner).expect(200, []);
    await api.get(query).set(stranger).expect(200, []);
    await api.get('/api/space').set(stranger).expect(200, { presets: [], preferences: null });
    await api.put(diaryUrl).set(stranger).send(diary).expect(404);
    await api.delete(diaryUrl).set(stranger).send({}).expect(404);
    await api
      .put(diaryUrl)
      .set(owner)
      .send({ ...diary, rest: null, note: '' })
      .expect(200);
    await api.post('/api/auth/logout').set(owner).send({}).expect(204);
    await api.get('/api/space').set(owner).expect(401);
    const resumed = bind(await login(a, password, api).expect(200));
    await api
      .get('/api/space')
      .set(resumed)
      .expect(200, { presets: [{ id: created.id, ...changed }], preferences: settings });
    await api
      .get(query)
      .set(resumed)
      .expect(200, [{ ...entry, rest: null, note: '' }]);
    await api.delete(presetUrl).set(resumed).send({}).expect(204);
    await api
      .get('/api/space')
      .set(resumed)
      .expect(200, { presets: [], preferences: { ...settings, scene: null } });
    await api.delete(diaryUrl).set(resumed).send({}).expect(204);
    await api.get(query).set(resumed).expect(200, []);
    await api.delete('/api/space/preferences').set(resumed).send({}).expect(204);
    await api.get('/api/space').set(resumed).expect(200, { presets: [], preferences: null });
  }, 15_000);
  it('注册、大小写唯一约束、服务端校验、错误凭据一致与持久化', async () => {
    const api = request(app);
    await api.get('/api/auth/status').expect(200);
    const username = await register(api);
    await api
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ username, password })
      .expect(409);
    await api
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ username: 'x', password: 'short', role: 'admin' })
      .expect(400);
    const wrong = await login(username, 'wrong').expect(401);
    const missing = await login(randomName(), 'wrong').expect(401);
    expect(wrong.body.error.code).toBe(missing.body.error.code);
    expect(wrong.body.error.message).toBe(missing.body.error.message);
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT password_hash FROM users WHERE username = ?',
      [username],
    );
    expect(rows[0]?.password_hash).toMatch(/^scrypt-v1\$/);
    expect(rows[0]?.password_hash).not.toContain(password);
    const session = await login(username).expect(200);
    expect(session.body).toMatchObject({ username });
    expect(session.body).not.toHaveProperty('password_hash');
    expect(session.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(session.headers['set-cookie']?.[0]).toContain('SameSite=Lax');
    await request(createApp({ config, database: pool }))
      .get('/api/auth/me')
      .set('Cookie', cookieFrom(session))
      .expect(200, session.body);
  });
  it('会话以身份隔离，拒绝指定身份，轮换、退出和过期真实失效', async () => {
    const api = request(createApp({ config, database: pool }));
    const a = await register(api);
    const b = await register(api);
    const first = await login(a, password, api).expect(200);
    const second = await login(b, password, api).expect(200);
    const cookieA = cookieFrom(first);
    const cookieB = cookieFrom(second);
    await api.get('/api/account').set('Cookie', cookieA).expect(200, first.body);
    await api.get('/api/account').set('Cookie', cookieB).expect(200, second.body);
    await api.get(`/api/account?id=${second.body.id}`).set('Cookie', cookieA).expect(400);
    const rotated = await login(a, password, api).set('Cookie', cookieA).expect(200);
    await api.get('/api/account').set('Cookie', cookieA).expect(401);
    const rotatedCookie = cookieFrom(rotated);
    await api
      .post('/api/auth/logout')
      .set('Cookie', rotatedCookie)
      .set('Origin', 'https://outside.example')
      .send({})
      .expect(403);
    await api.get('/api/account').set('Cookie', rotatedCookie).expect(200);
    await api
      .post('/api/auth/logout')
      .set('Cookie', rotatedCookie)
      .set('Origin', origin)
      .send({})
      .expect(204);
    await api.get('/api/account').set('Cookie', rotatedCookie).expect(401);
    await api.get('/api/account').set('Cookie', cookieB).expect(200, second.body);
    const digest = createHash('sha256').update(cookieB.split('=')[1]!).digest();
    await pool.execute(
      'UPDATE auth_sessions SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND WHERE token_hash = ?',
      [digest],
    );
    await api.get('/api/account').set('Cookie', cookieB).expect(401);
  });
  it('生产 Cookie 使用 __Host 前缀、Secure 和无 Domain 约束', async () => {
    const siteOrigin = 'https://jhaven.example';
    const production = loadConfig({
      ...process.env,
      APP_ORIGIN: siteOrigin,
      NODE_ENV: 'production',
    });
    const api = request(createApp({ config: production, database: pool }));
    const username = await register(api, siteOrigin);
    const response = await login(username, password, api, siteOrigin).expect(200);
    const cookie = response.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/^__Host-jhaven_session=.*; Path=\/;/);
    for (const value of ['Secure', 'HttpOnly', 'SameSite=Lax'])
      expect(cookie).toContain(`; ${value}`);
    expect(cookie).not.toContain('Domain=');
  });
});
