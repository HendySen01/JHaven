import { randomUUID } from 'node:crypto';
import { APP_INFO, type HealthResponse } from '@jhaven/shared';
import express from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import type { Pool } from 'mysql2/promise';
import { loadConfig, type Config } from './config.js';
import { createAuthRouter } from './auth/routes.js';
import { AppError, errorHandler } from './middleware/error-handler.js';
import { createAssistantRouter } from './assistant/routes.js';
import { openAiProvider, deepSeekProvider, type AssistantProvider } from './assistant/provider.js';

export function createApp({
  config = loadConfig({}),
  database,
  assistantProvider,
  assistantTimeoutMs,
}: {
  config?: Config;
  database?: Pool | undefined;
  assistantProvider?: AssistantProvider;
  assistantTimeoutMs?: number;
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (config.TRUST_LOOPBACK_PROXY === '1') app.set('trust proxy', 'loopback');
  app.use(helmet());
  app.use((_request, response, next) => {
    const requestId = randomUUID();
    response.locals.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', (request, response) => {
    if (!z.strictObject({}).safeParse(request.query).success) {
      throw new AppError(400, 'INVALID_QUERY', '健康检查不接受查询参数。');
    }
    const body: HealthResponse = {
      status: 'ok',
      service: 'jhaven-api',
      stage: APP_INFO.stage,
    };
    response.json(body);
  });

  const assistant =
    assistantProvider ??
    (config.DEEPSEEK_API_KEY && config.AI_DAILY_REQUEST_LIMIT > 0
      ? deepSeekProvider(config.DEEPSEEK_API_KEY, config.DEEPSEEK_MODEL, config.DEEPSEEK_BASE_URL)
      : config.AI_OPENAI_API_KEY && config.AI_DAILY_REQUEST_LIMIT > 0
        ? openAiProvider(config.AI_OPENAI_API_KEY, config.AI_OPENAI_MODEL)
        : undefined);
  app.use(
    '/api/assistant',
    createAssistantRouter({
      origin: config.APP_ORIGIN,
      provider: assistant,
      dailyLimit: config.AI_DAILY_REQUEST_LIMIT,
      dailyBudget: config.AI_DAILY_BUDGET_USD,
      ...(assistantTimeoutMs === undefined ? {} : { timeoutMs: assistantTimeoutMs }),
    }),
  );
  app.use(
    '/api',
    createAuthRouter({
      pool: database,
      origin: config.APP_ORIGIN,
      secure: config.NODE_ENV === 'production',
    }),
  );

  app.use((_request, _response, next) => {
    next(new AppError(404, 'NOT_FOUND', '未找到请求的接口。'));
  });
  app.use(errorHandler);
  return app;
}
