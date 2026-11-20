import { Router, type Request } from 'express';
import { assistantRequest, type AssistantEvent, type AssistantProviderId } from '@jhaven/shared';
import { z } from 'zod';
import { AppError } from '../middleware/error-handler.js';
import { assistantPlan, privateAssistantText } from './rules.js';
import { knowledgeVersion } from './knowledge.js';
import {
  estimateCost,
  ProviderError,
  type AssistantProvider,
  type TokenUsage,
} from './provider.js';
import { createAssistantWindows, dayMs } from './quota.js';
import { groundedPrompt, groundedResult } from './grounded.js';

type Usage = { calls: number; cost: number; inflight: number };
type Limits = { dailyLimit: number; dailyBudget: number };
export function createAssistantRouter({
  origin,
  providers,
  providerLimits,
  dailyLimit,
  dailyBudget = 0.1,
  timeoutMs,
  secure = false,
  accountId,
  now = Date.now,
}: {
  origin: string;
  providers: readonly AssistantProvider[];
  providerLimits: Record<AssistantProviderId, Limits>;
  dailyLimit: number;
  dailyBudget?: number;
  timeoutMs?: number;
  secure?: boolean;
  accountId?: (request: Request) => Promise<string | undefined>;
  now?: () => number;
}) {
  const router = Router();
  const empty = z.strictObject({});
  const windows = createAssistantWindows(secure);
  const registry = new Map(providers.map((provider) => [provider.name, provider]));
  const usage = new Map<AssistantProviderId, Usage>();
  const total: Usage = { calls: 0, cost: 0, inflight: 0 };
  let day = -1;

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
    const { mode, provider, model, messages, previousReply, earlierReply } = input.data;
    const plan = assistantPlan(messages);
    const chosen = mode === 'ai' && provider ? registry.get(provider) : undefined;
    const authorized = chosen && chosen.model === model ? chosen : undefined;
    const selected = plan.model || ('grounded' in plan && plan.grounded) ? authorized : undefined;
    const ip = request.ip ?? 'unknown';
    const arrival = now();
    if (selected) {
      windows.take('network:' + ip, 60, arrival, response);
      const user = await accountId?.(request);
      if (response.destroyed) return;
      const actor = user ? 'account:' + user : 'guest:' + windows.guest(request, response);
      windows.take(actor, user ? 24 : 12, now(), response);
    } else windows.take('local:' + ip, 120, arrival, response, true);
    const timestamp = now();
    const currentDay = Math.floor(timestamp / dayMs);
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
    const modelInput = prior
      ? JSON.stringify({ ...(older ? { earlier: older } : {}), previous: prior, latest })
      : latest;
    const system = selected ? groundedPrompt(plan.sources, !!prior, latest, plan.factual) : '';
    const reservation = selected ? estimateCost(selected, system, modelInput, detailed) : 0;
    let ledger: Usage | undefined;
    if (selected) {
      ledger = usage.get(selected.name) ?? { calls: 0, cost: 0, inflight: 0 };
      usage.set(selected.name, ledger);
      const limit = providerLimits[selected.name];
      if (total.inflight >= 8 || ledger.inflight >= 4)
        throw new AppError(429, 'MODEL_CONCURRENCY', '现在有些忙，等一会儿再试。');
      const limitCode =
        total.calls >= dailyLimit
          ? 'MODEL_LIMIT'
          : ledger.calls >= limit.dailyLimit
            ? 'MODEL_PROVIDER_LIMIT'
            : total.cost + reservation > dailyBudget + 1e-9
              ? 'MODEL_BUDGET'
              : ledger.cost + reservation > limit.dailyBudget + 1e-9
                ? 'MODEL_PROVIDER_BUDGET'
                : undefined;
      if (limitCode) {
        if (!limitCode.endsWith('BUDGET'))
          response.setHeader(
            'Retry-After',
            Math.ceil(((currentDay + 1) * dayMs - timestamp) / 1000),
          );
        throw new AppError(429, limitCode, '这次 AI 请求达到站点的用量限制。');
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
    let reported: TokenUsage | undefined;
    let rejectedBeforeGeneration = false;
    try {
      const aborted = new Promise<never>((_resolve, reject) => {
        const abort = () => reject(signal.reason);
        cancel = () => signal.removeEventListener('abort', abort);
        signal.throwIfAborted();
        signal.addEventListener('abort', abort, { once: true });
      });
      const raw = await Promise.race([
        selected.choose(modelInput, signal, system, detailed, (usage) => {
          reported = usage;
        }),
        aborted,
      ]);
      const reply = groundedResult(
        raw,
        plan.sources,
        latest,
        'intent' in plan ? plan.intent : undefined,
        plan.factual,
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
      rejectedBeforeGeneration =
        error instanceof ProviderError &&
        ['authentication', 'balance', 'upstream_rate', 'model_unavailable'].includes(error.code);
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
      if (day === currentDay) {
        // 上游用量不明时保留一次预留。已明确拒绝生成时仅记尝试次数。
        const charge = reported
          ? estimateCost(selected, system, modelInput, detailed, reported)
          : rejectedBeforeGeneration
            ? 0
            : reservation;
        total.cost = Math.max(0, total.cost + charge - reservation);
        ledger.cost = Math.max(0, ledger.cost + charge - reservation);
      }
      total.inflight--;
      ledger.inflight--;
      if (!response.destroyed && !response.writableEnded) response.end();
    }
  });
  return router;
}
