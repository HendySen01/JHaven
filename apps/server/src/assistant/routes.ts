import { Router } from 'express';
import { assistantRequest, type AssistantEvent, type AssistantProviderId } from '@jhaven/shared';
import { z } from 'zod';
import { AppError } from '../middleware/error-handler.js';
import { assistantPlan, privateAssistantText } from './rules.js';
import { knowledgeVersion } from './knowledge.js';
import { ProviderError, type AssistantProvider } from './provider.js';
import { groundedPrompt, groundedResult } from './grounded.js';

const ipWindow = 10 * 60_000;
type Usage = { calls: number; cost: number; inflight: number };
type Limits = { dailyLimit: number; dailyBudget: number };
export function createAssistantRouter({
  origin,
  providers,
  providerLimits,
  dailyLimit,
  dailyBudget = 0.1,
  timeoutMs,
  now = Date.now,
}: {
  origin: string;
  providers: readonly AssistantProvider[];
  providerLimits: Record<AssistantProviderId, Limits>;
  dailyLimit: number;
  dailyBudget?: number;
  timeoutMs?: number;
  now?: () => number;
}) {
  const router = Router();
  const empty = z.strictObject({});
  const clients = new Map<string, { until: number; count: number }>();
  const registry = new Map(providers.map((provider) => [provider.name, provider]));
  const usage = new Map<AssistantProviderId, Usage>();
  const total: Usage = { calls: 0, cost: 0, inflight: 0 };
  let nextCleanup = 0,
    day = -1;

  router.get('/status', (request, response) => {
    if (!empty.safeParse(request.query).success)
      throw new AppError(400, 'INVALID_QUERY', '状态接口不接受查询参数。');
    response.json({
      provider: providers[0]?.name ?? null,
      providers: providers.flatMap(({ name, model }) => (model ? [{ id: name, model }] : [])),
      knowledgeVersion,
    });
  });
  router.post('/chat', async (request, response) => {
    if (request.get('Origin') !== origin || request.get('Sec-Fetch-Site') === 'cross-site')
      throw new AppError(403, 'INVALID_ORIGIN', '请从本站使用睡前助手。');
    if (!request.is('application/json'))
      throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', '助手请求须使用 JSON。');
    const input = assistantRequest.safeParse(request.body);
    if (!input.success || !empty.safeParse(request.query).success)
      throw new AppError(400, 'INVALID_INPUT', '最多发送三条消息，每条不超过 400 字符。');
    const timestamp = now();
    if (timestamp >= nextCleanup) {
      for (const [id, bucket] of clients) if (bucket.until <= timestamp) clients.delete(id);
      nextCleanup = timestamp + 60_000;
    }
    const ip = request.ip ?? 'unknown';
    const previousBucket = clients.get(ip);
    const bucket =
      previousBucket && previousBucket.until > timestamp
        ? previousBucket
        : { until: timestamp + ipWindow, count: 0 };
    if (bucket.count >= 8 || (!previousBucket && clients.size >= 4096)) {
      response.setHeader('Retry-After', Math.ceil((bucket.until - timestamp) / 1000));
      throw new AppError(429, 'ASSISTANT_LIMIT', 'JHaven 请求过于频繁，请稍后再试。');
    }
    bucket.count++;
    clients.set(ip, bucket);

    const { mode, provider, model, messages, previousReply, earlierReply } = input.data;
    const plan = assistantPlan(messages);
    const chosen = mode === 'ai' && provider ? registry.get(provider) : undefined;
    const authorized = chosen && chosen.model === model ? chosen : undefined;
    const selected = plan.model || ('grounded' in plan && plan.grounded) ? authorized : undefined;
    const currentDay = Math.floor(timestamp / 86_400_000);
    if (day !== currentDay) {
      day = currentDay;
      for (const entry of [total, ...usage.values()]) {
        entry.calls = 0;
        entry.cost = 0;
      }
    }
    const latest = messages.at(-1)!;
    const previous = messages.at(-2);
    const earlier = messages.at(-3);
    const prior =
      previous && previousReply && !privateAssistantText(previousReply)
        ? { user: previous, reply: previousReply }
        : undefined;
    const older =
      prior && earlier && earlierReply && !privateAssistantText(earlierReply)
        ? { user: earlier, reply: earlierReply }
        : undefined;
    const detailed =
      latest.length >= 90 || (!!prior && latest.length >= 40) || plan.sources.length > 1;
    // 失败与取消仍占当日预留，供应商账单需独立设置额度。
    const reservation = detailed ? 0.02 : 0.01;
    let ledger: Usage | undefined;
    if (selected) {
      ledger = usage.get(selected.name) ?? { calls: 0, cost: 0, inflight: 0 };
      usage.set(selected.name, ledger);
      const limit = providerLimits[selected.name];
      const busy = total.inflight >= 3 || ledger.inflight >= 2;
      if (
        busy ||
        total.calls >= dailyLimit ||
        ledger.calls >= limit.dailyLimit ||
        total.cost + reservation > dailyBudget + 1e-9 ||
        ledger.cost + reservation > limit.dailyBudget + 1e-9
      ) {
        response.setHeader(
          'Retry-After',
          busy ? 15 : Math.ceil(((day + 1) * 86_400_000 - timestamp) / 1000),
        );
        throw new AppError(
          429,
          busy ? 'MODEL_CONCURRENCY' : 'MODEL_LIMIT',
          busy ? 'JHaven 的 AI 请求正在排队。' : 'JHaven 的 AI 用量到达今日上限。',
        );
      }
    }
    const controller = new AbortController();
    response.on('close', () => controller.abort());
    const send = (event: AssistantEvent) => {
      if (!response.destroyed && !response.writableEnded)
        response.write(JSON.stringify(event) + '\n');
    };
    response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    response.setHeader('X-Accel-Buffering', 'no');
    const sendLocal = (fallback = false, override?: string) => {
      send(
        fallback
          ? { type: 'start', mode: 'local', source: 'fallback' }
          : { type: 'start', mode: 'local' },
      );
      send({ type: 'text', text: override ?? plan.text });
      send({
        type: 'done',
        sources: override ? [] : plan.sources,
        actions: override ? [] : plan.actions,
      });
    };
    if (!selected || !ledger) {
      sendLocal(mode === 'ai' && !authorized);
      response.end();
      return;
    }
    for (const entry of [total, ledger]) {
      entry.calls++;
      entry.cost += reservation;
      entry.inflight++;
    }
    const timeout = AbortSignal.timeout(timeoutMs ?? (detailed ? 25_000 : 12_000));
    const signal = AbortSignal.any([controller.signal, timeout]);
    let cancel: (() => void) | undefined;
    try {
      const aborted = new Promise<never>((_resolve, reject) => {
        const abort = () => reject(signal.reason);
        cancel = () => signal.removeEventListener('abort', abort);
        signal.throwIfAborted();
        signal.addEventListener('abort', abort, { once: true });
      });
      const modelInput = prior
        ? JSON.stringify({ ...(older ? { earlier: older } : {}), previous: prior, latest })
        : latest;
      const raw = await Promise.race([
        selected.choose(
          modelInput,
          signal,
          groundedPrompt(plan.sources, !!prior, latest),
          detailed,
        ),
        aborted,
      ]);
      const reply = groundedResult(
        raw,
        plan.sources,
        latest,
        'intent' in plan ? plan.intent : undefined,
      );
      if (!reply) {
        sendLocal(true);
        return;
      }
      if ('fallback' in reply) {
        sendLocal(true, reply.text);
        return;
      }
      send({ type: 'start', mode: 'model' });
      const characters = Array.from(reply.text);
      for (let i = 0; i < characters.length; i += 180)
        send({ type: 'text', text: characters.slice(i, i + 180).join('') });
      send({
        type: 'done',
        sources: [...reply.sources],
        actions: reply.actions,
        reason: reply.reason,
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof ProviderError && error.code === 'invalid_output') {
          sendLocal(true);
          return;
        }
        const code = timeout.aborted
          ? 'timeout'
          : error instanceof ProviderError
            ? error.code
            : 'upstream';
        const statuses: Partial<Record<ProviderError['code'], number>> = {
          upstream_rate: 429,
          balance: 402,
          timeout: 504,
        };
        response.status(statuses[code] ?? 502);
        if (error instanceof ProviderError && error.retryAfter !== undefined)
          response.setHeader('Retry-After', error.retryAfter);
        response.type('json').json({
          error: {
            code,
            message: 'AI 供应商未完成本次回复。',
            requestId: String(response.locals.requestId),
          },
        });
      }
    } finally {
      cancel?.();
      total.inflight--;
      ledger.inflight--;
      if (!response.destroyed && !response.writableEnded) response.end();
    }
  });
  return router;
}
