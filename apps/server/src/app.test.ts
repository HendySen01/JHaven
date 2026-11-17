import { healthResponseSchema } from '@jhaven/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

describe('API 基础契约', () => {
  const app = createApp();

  it('健康检查返回共享契约与基本安全头', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(healthResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('拒绝未声明的查询参数', async () => {
    const response = await request(app).get('/api/health?unexpected=1').expect(400);
    expect(response.body.error.code).toBe('INVALID_QUERY');
  });

  it('未知接口返回结构化错误与请求编号，不泄露堆栈', async () => {
    const response = await request(app).get('/api/diaries').expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
    expect(response.body).not.toHaveProperty('stack');
  });

  it('无效 JSON 返回可理解的错误', async () => {
    const response = await request(app)
      .post('/api/diaries')
      .set('Content-Type', 'application/json')
      .send('{broken')
      .expect(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });

  it('限制请求正文大小', async () => {
    const response = await request(app)
      .post('/api/diaries')
      .send({ note: 'a'.repeat(17 * 1024) })
      .expect(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('运行配置', () => {
  it('无需环境文件即可使用本地默认配置', () => {
    expect(loadConfig({})).toEqual({ NODE_ENV: 'development', HOST: '127.0.0.1', PORT: 3001 });
  });

  it.each(['', '0', '65536', '3001.5', 'invalid'])('拒绝非法端口 %j', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow('PORT');
  });
});
