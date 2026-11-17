import { randomUUID } from 'node:crypto';
import { APP_INFO, type HealthResponse } from '@jhaven/shared';
import express from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { AppError, errorHandler } from './middleware/error-handler.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
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

  app.use((_request, _response, next) => {
    next(new AppError(404, 'NOT_FOUND', '未找到请求的接口。'));
  });
  app.use(errorHandler);
  return app;
}
