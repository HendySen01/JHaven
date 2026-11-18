import { Router } from 'express';
import { assistantRequest, type AssistantEvent } from '@jhaven/shared';
import { z } from 'zod';
import { AppError } from '../middleware/error-handler.js';
import { assistantPlan } from './rules.js';
import { knowledgeVersion } from './knowledge.js';
import { modelChoice, ProviderError, type AssistantProvider } from './provider.js';
import { groundedPrompt, groundedResult } from './grounded.js';

const ipWindow = 10 * 60_000;
const opening = {
  gentle: '可以慢一点，先给自己留一点空间。',
  brief: '今晚可以只选一件轻松的事。',
  space: '你可以按现在觉得舒服的方式开始。',
};
const ending = {
  simple: '选一个合适的步骤就够了。',
  'take-time': '可以按自己的节奏来。',
  'stop-here': '愿意的话，今晚就停在这里。',
};
export function createAssistantRouter({
  origin,
  provider,
  dailyLimit,
  dailyBudget = 0.1,
  timeoutMs = 12_000,
  now = Date.now,
}: {
  origin: string;
  provider?: AssistantProvider | undefined;
  dailyLimit: number;
  dailyBudget?: number;
  timeoutMs?: number;
  now?: () => number;
}) {
  const router = Router();
  const empty = z.strictObject({});
  const clients = new Map<string, { until: number; count: number }>();
  let nextCleanup = 0,
    day = -1,
    modelCalls = 0,
    reservedCost = 0,
    inflight = 0;

  router.get('/status', (request, response) => {
    if (!empty.safeParse(request.query).success)
      throw new AppError(400, 'INVALID_QUERY', '状态接口不接受查询参数。');
    response.json({ provider: provider?.name ?? null, knowledgeVersion });
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
    const previous = clients.get(ip);
    const bucket =
      previous && previous.until > timestamp ? previous : { until: timestamp + ipWindow, count: 0 };
    if (bucket.count >= 8 || (!previous && clients.size >= 4096)) {
      response.setHeader('Retry-After', Math.ceil((bucket.until - timestamp) / 1000));
      throw new AppError(429, 'ASSISTANT_LIMIT', '休息一下，稍后可以继续使用助手。');
    }
    bucket.count++;
    clients.set(ip, bucket);

    const plan = assistantPlan(input.data.messages);
    const chosen = input.data.useModel ? provider : undefined;
    const grounded =
      chosen?.name === 'deepseek' && (plan.model || ('grounded' in plan && plan.grounded));
    const selected = plan.model || grounded ? chosen : undefined;
    const currentDay = Math.floor(timestamp / 86_400_000);
    if (day !== currentDay) {
      day = currentDay;
      modelCalls = 0;
      reservedCost = 0;
    }
    // 每次预留 0.01 美元，覆盖有界提示、用户输入和输出。
    // 不退款可覆盖断线时未收到 usage 的请求；价格变化后需重新审阅。
    if (
      selected &&
      (modelCalls >= dailyLimit || reservedCost + 0.01 > dailyBudget + 1e-9 || inflight >= 3)
    ) {
      response.setHeader(
        'Retry-After',
        inflight >= 3 ? 15 : Math.ceil(((day + 1) * 86_400_000 - timestamp) / 1000),
      );
      throw new AppError(429, 'MODEL_LIMIT', '模型额度暂不可用。你可以使用本地知识模式。');
    }
    const controller = new AbortController();
    response.on('close', () => controller.abort());
    const send = (event: AssistantEvent) => {
      if (!response.destroyed && !response.writableEnded)
        response.write(JSON.stringify(event) + '\n');
    };
    response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    response.setHeader('X-Accel-Buffering', 'no');
    const sendLocal = () => {
      send({ type: 'start', mode: 'local' });
      send({ type: 'text', text: plan.text });
      send({ type: 'done', sources: plan.sources, actions: plan.actions });
    };
    if (!selected) {
      sendLocal();
      response.end();
      return;
    }
    modelCalls++;
    reservedCost += 0.01;
    inflight++;
    if (grounded) response.flushHeaders();
    else {
      send({ type: 'start', mode: 'model' });
      send({ type: 'text', text: plan.text + '\n\n' });
    }
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = AbortSignal.any([controller.signal, timeout]);
    let cancel: (() => void) | undefined;
    try {
      const aborted = new Promise<never>((_resolve, reject) => {
        const abort = () => reject(signal.reason);
        cancel = () => signal.removeEventListener('abort', abort);
        signal.throwIfAborted();
        signal.addEventListener('abort', abort, { once: true });
      });
      const latest = input.data.messages.at(-1)!;
      const raw = await Promise.race([
        grounded
          ? selected.choose(latest, signal, groundedPrompt(plan.sources))
          : selected.choose(latest, signal),
        aborted,
      ]);
      if (grounded) {
        const reply = groundedResult(
          raw,
          plan.sources,
          latest,
          'intent' in plan ? plan.intent : undefined,
        );
        if (!reply) {
          sendLocal();
          return;
        }
        send({ type: 'start', mode: 'model' });
        send({ type: 'text', text: reply.text });
        send({
          type: 'done',
          sources: [...reply.sources],
          actions: reply.actions,
          reason: reply.reason,
        });
        return;
      }
      const choice = modelChoice.safeParse(raw);
      if (!choice.success) throw new ProviderError('invalid_output');
      send({ type: 'text', text: opening[choice.data.opening] + '\n\n' });
      send({ type: 'text', text: ending[choice.data.ending] });
      send({ type: 'done', sources: plan.sources, actions: plan.actions });
    } catch (error) {
      if (!controller.signal.aborted) {
        if (grounded && error instanceof ProviderError && error.code === 'invalid_output') {
          sendLocal();
          return;
        }
        if (grounded) send({ type: 'start', mode: 'model' });
        send({
          type: 'error',
          code: timeout.aborted
            ? 'timeout'
            : error instanceof ProviderError
              ? error.code
              : 'upstream',
        });
      }
    } finally {
      cancel?.();
      inflight--;
      if (!response.destroyed) response.end();
    }
  });
  return router;
}
