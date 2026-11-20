import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { AppError } from '../middleware/error-handler.js';

const windowMs = 10 * 60_000;
export const dayMs = 86_400_000;

export function createAssistantWindows(secure: boolean) {
  const aiBuckets = new Map<string, { until: number; count: number }>();
  const localBuckets = new Map<string, { until: number; count: number }>();
  const key = randomBytes(32);
  const cookie = secure ? '__Host-jhaven_assistant' : 'jhaven_assistant';
  let nextCleanup = 0;
  const sign = (id: string) => createHmac('sha256', key).update(id).digest('hex');

  return {
    guest(request: Request, response: Response) {
      const cookieValue = request.headers.cookie
        ?.split(';')
        .find((part) => part.trim().startsWith(`${cookie}=`));
      const match = /^[a-f0-9]{32}\.([a-f0-9]{64})$/.exec(
        cookieValue?.trim().slice(cookie.length + 1) ?? '',
      );
      if (match) {
        const id = match[0].slice(0, 32);
        if (timingSafeEqual(Buffer.from(match[1]!, 'hex'), Buffer.from(sign(id), 'hex'))) return id;
      }
      const id = randomBytes(16).toString('hex');
      response.cookie(cookie, `${id}.${sign(id)}`, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
      });
      return id;
    },
    take(key: string, limit: number, timestamp: number, response: Response, local = false) {
      if (timestamp >= nextCleanup) {
        for (const buckets of [aiBuckets, localBuckets])
          for (const [id, bucket] of buckets) if (bucket.until <= timestamp) buckets.delete(id);
        nextCleanup = timestamp + 60_000;
      }
      const buckets = local ? localBuckets : aiBuckets;
      const previous = buckets.get(key);
      const bucket =
        previous && previous.until > timestamp
          ? previous
          : { until: timestamp + windowMs, count: 0 };
      if (bucket.count >= limit || (!previous && buckets.size >= 16_384)) {
        if (bucket.count >= limit)
          response.setHeader('Retry-After', Math.ceil((bucket.until - timestamp) / 1000));
        throw new AppError(
          429,
          local ? 'LOCAL_MODE_LIMIT' : 'ASSISTANT_LIMIT',
          '消息发得有点快，请稍后再试。',
        );
      }
      bucket.count++;
      buckets.set(key, bucket);
    },
  };
}
