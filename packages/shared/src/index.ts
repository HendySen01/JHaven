import { z } from 'zod';
export * from './auth.js';
export * from './space.js';
export * from './relaxation.js';
export * from './assistant.js';
export * from './chat-history.js';

export const APP_INFO = {
  name: 'JHaven',
  version: '0.1.0-alpha.7',
  stage: 'sleep-assistant',
  tagline: 'Your Quiet Haven, Every Night.',
} as const;

// 健康检查只表示 API 进程可响应，不表示业务或数据库已经就绪。
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('jhaven-api'),
  stage: z.literal(APP_INFO.stage),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export interface ApiErrorResponse {
  error: { code: string; message: string; requestId: string };
}
