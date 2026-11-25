import { randomUUID } from 'node:crypto';
import { APP_INFO, type HealthResponse } from '@jhaven/shared';
import express from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import type { Pool } from 'pg';
import { loadConfig, type Config } from './config.js';
import { createAuthRouter } from './auth/routes.js';
import { AppError, errorHandler } from './middleware/error-handler.js';
import { createAssistantRouter } from './assistant/routes.js';
import { openAiProvider, deepSeekProvider, type AssistantProvider } from './assistant/provider.js';
import { findAccount } from './auth/repository.js';
import { sessionToken } from './auth/session-cookie.js';

export function createApp({
  config = loadConfig({}),
  database,
  assistantProvider,
  assistantProviders,
  assistantTimeoutMs,
}: {
  config?: Config;
  database?: Pool | undefined;
  assistantProvider?: AssistantProvider;
  assistantProviders?: readonly AssistantProvider[];
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
  const standardJson = express.json({ limit: '16kb' });
  app.use((request, response, next) => {
    // 历史路由先检查会话和来源，再读取受限大小的聊天快照。
    if (/^\/api\/space\/chat(?:\/|$)/i.test(request.path)) return next();
    standardJson(request, response, next);
  });

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

  const providerLimits = {
    deepseek: {
      dailyLimit: config.AI_DEEPSEEK_DAILY_REQUEST_LIMIT,
      dailyBudget: config.AI_DEEPSEEK_DAILY_BUDGET_USD,
    },
    openai: {
      dailyLimit: config.AI_OPENAI_DAILY_REQUEST_LIMIT,
      dailyBudget: config.AI_OPENAI_DAILY_BUDGET_USD,
    },
  };
  const configured: AssistantProvider[] = [];
  const secure = config.NODE_ENV === 'production';
  if (config.AI_DAILY_REQUEST_LIMIT > 0 && config.AI_DAILY_BUDGET_USD > 0) {
    if (
      config.DEEPSEEK_API_KEY &&
      config.AI_VERIFIED_DEEPSEEK_MODEL === config.DEEPSEEK_MODEL &&
      providerLimits.deepseek.dailyLimit > 0 &&
      providerLimits.deepseek.dailyBudget > 0
    )
      configured.push(
        deepSeekProvider(config.DEEPSEEK_API_KEY, config.DEEPSEEK_MODEL, config.DEEPSEEK_BASE_URL),
      );
    if (
      config.AI_OPENAI_API_KEY &&
      config.AI_VERIFIED_OPENAI_MODEL === config.AI_OPENAI_MODEL &&
      providerLimits.openai.dailyLimit > 0 &&
      providerLimits.openai.dailyBudget > 0
    )
      configured.push(
        openAiProvider(
          config.AI_OPENAI_API_KEY,
          config.AI_OPENAI_MODEL,
          fetch,
          config.AI_OPENAI_BASE_URL,
        ),
      );
  }
  app.use(
    '/api/assistant',
    createAssistantRouter({
      origin: config.APP_ORIGIN,
      providers: assistantProviders ?? (assistantProvider ? [assistantProvider] : configured),
      providerLimits,
      dailyLimit: config.AI_DAILY_REQUEST_LIMIT,
      dailyBudget: config.AI_DAILY_BUDGET_USD,
      windowsLimits: {
        account: config.AI_ACCOUNT_WINDOW_LIMIT,
        guest: config.AI_GUEST_WINDOW_LIMIT,
        network: config.AI_IP_WINDOW_LIMIT,
      },
      secure,
      async accountId(request) {
        const token = sessionToken(request, secure);
        if (!database || !token) return undefined;
        return (await findAccount(database, token).catch(() => null))?.id;
      },
      ...(assistantTimeoutMs === undefined ? {} : { timeoutMs: assistantTimeoutMs }),
    }),
  );
  app.use(
    '/api',
    createAuthRouter({
      pool: database,
      origin: config.APP_ORIGIN,
      secure,
    }),
  );

  app.use((_request, _response, next) => {
    next(new AppError(404, 'NOT_FOUND', '未找到请求的接口。'));
  });
  app.use(errorHandler);
  return app;
}
