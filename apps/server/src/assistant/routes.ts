import { Router, type Request } from 'express';
import {
  assistantExchangeBytes,
  assistantHistoryBytes,
  assistantPrefersChat,
  assistantProviderId,
  assistantRequest,
  type AssistantEvent,
  type AssistantExchange,
  type AssistantFallbackCode,
  type AssistantProviderId,
} from '@jhaven/shared';
import { z } from 'zod';
import { AppError } from '../middleware/error-handler.js';
import { assistantInjection, assistantPlan, privateAssistantText } from './rules.js';
import { knowledgeVersion } from './knowledge.js';
import {
  estimateCost,
  ProviderError,
  type AssistantProvider,
  type TokenUsage,
} from './provider.js';
import { createAssistantWindows, dayMs } from './quota.js';
import { asksForPracticalHelp, groundedPrompt, groundedResult } from './grounded.js';

type Usage = { calls: number; cost: number; inflight: number };
type Limits = { dailyLimit: number; dailyBudget: number };
export function createAssistantRouter({
  origin,
  providers,
  providerLimits,
  dailyLimit,
  dailyBudget = 0.1,
  windowsLimits = { account: 60, guest: 30, network: 180 },
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
  windowsLimits?: { account: number; guest: number; network: number };
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

  function resetDaily(timestamp: number) {
    const currentDay = Math.floor(timestamp / dayMs);
    if (day !== currentDay) {
      day = currentDay;
      for (const entry of [total, ...usage.values()]) {
        entry.calls = 0;
        entry.cost = 0;
      }
    }
    return currentDay;
  }

  function providerQuota(name: AssistantProviderId) {
    const ledger = usage.get(name) ?? { calls: 0, cost: 0, inflight: 0 };
    usage.set(name, ledger);
    return ledger;
  }

  function restriction(name: AssistantProviderId, reservation: number, timestamp: number) {
    const ledger = providerQuota(name);
    const limit = providerLimits[name];
    const retryAfter = Math.ceil(((day + 1) * dayMs - timestamp) / 1000);
    if (total.calls >= dailyLimit) return { code: 'MODEL_LIMIT', retryAfter };
    if (ledger.calls >= limit.dailyLimit) return { code: 'MODEL_PROVIDER_LIMIT', retryAfter };
    if (total.cost + reservation > dailyBudget + 1e-9) return { code: 'MODEL_BUDGET' };
    if (ledger.cost + reservation > limit.dailyBudget + 1e-9)
      return { code: 'MODEL_PROVIDER_BUDGET' };
    if (total.inflight >= 8 || ledger.inflight >= 4) return { code: 'MODEL_CONCURRENCY' };
  }

  router.get('/status', (request, response) => {
    if (!empty.safeParse(request.query).success)
      throw new AppError(400, 'INVALID_QUERY', '状态接口不接受查询参数。');
    response.json({
      provider: providers[0]?.name ?? null,
      providers: providers.flatMap(({ name, model }) => (model ? [{ id: name, model }] : [])),
      knowledgeVersion,
    });
  });
  const availabilityQuery = z.strictObject({
    provider: assistantProviderId,
    model: z
      .string()
      .regex(/^[\w.-]{1,80}$/)
      .optional(),
    reservation: z.string().max(32).transform(Number).pipe(z.number().positive().max(10)),
  });
  // 查询只检查站内账本，不读取草稿、会话或联系供应商。
  router.get('/availability', (request, response) => {
    const query = availabilityQuery.safeParse(request.query);
    if (!query.success) throw new AppError(400, 'INVALID_QUERY', '无效的额度查询。');
    const { provider, model, reservation } = query.data;
    const selected = registry.get(provider);
    if (!selected || selected.model !== model)
      return response.json({ available: false, code: 'model_unavailable' });
    const timestamp = now();
    resetDaily(timestamp);
    const blocked = restriction(provider, reservation, timestamp);
    return response.json(blocked ? { available: false, ...blocked } : { available: true });
  });
  router.post('/chat', async (request, response) => {
    if (request.get('Origin') !== origin || request.get('Sec-Fetch-Site') === 'cross-site')
      throw new AppError(403, 'INVALID_ORIGIN', '请从本站使用睡前助手。');
    if (!request.is('application/json'))
      throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', '助手请求须使用 JSON。');
    const input = assistantRequest.safeParse(request.body);
    if (!input.success || !empty.safeParse(request.query).success)
      throw new AppError(400, 'INVALID_INPUT', '最多发送三条消息，每条不超过 400 字符。');
    const {
      mode,
      provider,
      model,
      messages,
      previousReply,
      earlierReply,
      olderHistory,
      latestSentOn,
      previousSentOn,
      earlierSentOn,
    } = input.data;
    const latest = messages.at(-1)!;
    const prefersChat = input.data.prefersChat === true || assistantPrefersChat(latest);
    const plan = assistantPlan(messages, prefersChat);
    const chosen = mode === 'ai' && provider ? registry.get(provider) : undefined;
    const authorized = chosen && chosen.model === model ? chosen : undefined;
    const selected = plan.model ? authorized : undefined;
    const ip = request.ip ?? 'unknown';
    const arrival = now();
    if (selected) {
      windows.take('network:' + ip, windowsLimits.network, arrival, response);
      const user = await accountId?.(request);
      if (response.destroyed) return;
      const actor = user ? 'account:' + user : 'guest:' + windows.guest(request, response);
      windows.take(actor, user ? windowsLimits.account : windowsLimits.guest, now(), response);
    } else windows.take('local:' + ip, 120, arrival, response, true);
    const timestamp = now();
    const currentDay = resetDaily(timestamp);
    const previous = messages.at(-2);
    const earlier = messages.at(-3);
    const safeHistory = (text: string) => !privateAssistantText(text) && !assistantInjection(text);
    let historyBytes = assistantHistoryBytes;
    const keep = (turn: AssistantExchange) => {
      const size = assistantExchangeBytes(turn);
      if (size > historyBytes || !safeHistory(turn.user) || !safeHistory(turn.reply)) return false;
      historyBytes -= size;
      return true;
    };
    const exchange = (user?: string, reply?: string, sentOn?: string) => {
      if (!user || !reply) return;
      const turn = { user, reply, ...(sentOn ? { sentOn } : {}) };
      if (keep(turn)) return turn;
    };
    const prior = exchange(previous, previousReply, previousSentOn);
    const older = exchange(earlier, earlierReply, earlierSentOn);
    const history =
      earlier && earlierReply && previous && previousReply
        ? (olderHistory ?? []).slice().reverse().filter(keep).reverse()
        : [];
    const contextual = !!(prior || older || history.length || latestSentOn);
    const detailed =
      latest.length >= 90 || (!!prior && latest.length >= 40) || plan.sources.length > 1;
    const modelInput = contextual
      ? JSON.stringify({
          ...(history.length ? { history } : {}),
          ...(older ? { earlier: older } : {}),
          ...(prior ? { previous: prior } : {}),
          ...(latestSentOn ? { latestSentOn } : {}),
          latest,
        })
      : latest;
    const system = selected
      ? groundedPrompt(plan.sources, contextual, latest, plan.factual, prefersChat)
      : '';
    const practical =
      !plan.factual && !plan.actions.length && asksForPracticalHelp(latest, prefersChat);
    const reservation = selected
      ? estimateCost(selected, system, modelInput, detailed, undefined, practical)
      : 0;
    let ledger: Usage | undefined;
    if (selected) {
      ledger = providerQuota(selected.name);
      const blocked = restriction(selected.name, reservation, timestamp);
      if (blocked) {
        if (blocked.retryAfter) response.setHeader('Retry-After', blocked.retryAfter);
        else response.setHeader('X-JHaven-Reservation', reservation);
        throw new AppError(429, blocked.code, '这次 AI 请求暂时达到站点的用量限制。');
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
    const diagnostic = (code: string, output?: ProviderError['diagnostic']) => {
      console.info('助手路由', {
        requestId: String(response.locals.requestId),
        provider: selected?.name ?? provider,
        attempted: Boolean(selected),
        code,
        ...(output ? { output } : {}),
      });
    };
    const sendLocal = (
      fallbackCode?: AssistantFallbackCode,
      override?: string,
      output?: ProviderError['diagnostic'],
    ) => {
      if (fallbackCode) diagnostic(fallbackCode, output);
      send(
        fallbackCode
          ? { type: 'start', mode: 'local', source: 'fallback', fallbackCode }
          : {
              type: 'start',
              mode: 'local',
              ...('inputRestricted' in plan && plan.inputRestricted
                ? { inputRestricted: true }
                : {}),
            },
      );
      send({ type: 'text', text: override ?? plan.text });
      send({
        type: 'done',
        sources: override ? [] : plan.sources,
        actions: fallbackCode ? [] : plan.actions,
      });
    };
    if (!selected || !ledger) {
      if (mode === 'ai' && plan.model && !authorized) {
        const unavailable = provider !== undefined && !chosen;
        sendLocal(
          unavailable ? 'provider_unavailable' : 'authorization_required',
          unavailable ? '所选模型当前不可用。' : '请重新确认要使用的 AI 模型。',
        );
      } else {
        if (mode === 'ai' && !plan.model) diagnostic('local_policy');
        sendLocal();
      }
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
        selected.choose(
          modelInput,
          signal,
          system,
          detailed,
          (usage) => {
            reported = usage;
          },
          practical,
        ),
        aborted,
      ]);
      const reply = groundedResult(
        raw,
        plan.sources,
        latest,
        'intent' in plan ? plan.intent : undefined,
        plan.factual,
        prefersChat,
      );
      if (!reply || 'fallbackCode' in reply) {
        sendLocal(
          reply?.fallbackCode ?? 'output_rejected',
          (reply && 'text' in reply ? reply.text : undefined) ??
            (!plan.factual ? '这次 AI 没能给出可用的回复。可以重试，或改用本地知识。' : undefined),
        );
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
          sendLocal(
            'provider_invalid_output',
            !plan.factual ? '模型回复格式异常。可以重试，或改用本地知识。' : undefined,
            error.diagnostic,
          );
          return;
        }
        const code = timeout.aborted
          ? 'timeout'
          : error instanceof ProviderError
            ? error.code
            : 'upstream';
        const statuses: Partial<Record<ProviderError['code'], number>> = {
          provider_content_filtered: 422,
          upstream_rate: 429,
          balance: 402,
          timeout: 504,
        };
        diagnostic(code, error instanceof ProviderError ? error.diagnostic : undefined);
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
