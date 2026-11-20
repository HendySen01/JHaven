import {
  assistantEvent,
  type AssistantExchange,
  type AssistantEvent,
  type AssistantMode,
  type AssistantProviderId,
} from '@jhaven/shared';
import { z } from 'zod';

export const assistantErrors: Record<string, string> = {
  authentication: '模型认证失败，请联系站点维护者。可改用本地知识。',
  balance: '模型账户余额不足，可改用本地知识。',
  model_unavailable: '配置的模型暂不可用，可改用本地知识。',
  timeout: '这次回复超过等待时间，可以重试或使用本地知识。',
  upstream: '模型暂时不可用，可以重试或使用本地知识。',
  upstream_rate: '模型服务暂时限流，可以稍后重试或使用本地知识。',
  stream_interrupted: '模型回复连接中断，可以重试或改用本地知识。',
  provider_content_filtered: '这条消息未能收到模型回复。草稿还在，可以调整措辞后再试。',
  INVALID_INPUT: '这条消息或附带的历史未通过本站校验。草稿还在。',
  PAYLOAD_TOO_LARGE: '这次发送的内容太多。草稿还在，可以缩短后再试。',
  invalid_output: '这次模型回复未能通过检查，可以重试或使用本地知识。',
  MODEL_CONCURRENCY: '本站的 AI 请求暂时较多。',
  unknown_provider_error: 'AI 供应商未能完成请求，可以改用本地知识。',
  proxy_rate: '连接暂时受到限流，服务未返回原因。请稍后再试。',
  MODEL_LIMIT: '本站今天的 AI 请求次数已用完，可以改用本地知识。',
  MODEL_PROVIDER_LIMIT: '这个模型今天的站内请求次数已用完，可以改用本地知识。',
  MODEL_BUDGET: '本站的 AI 预算暂时不够完成这条消息。可以稍后再试，或改用本地知识。',
  MODEL_PROVIDER_BUDGET: '这个模型的站内预算暂时不够完成这条消息。可以稍后再试，或改用本地知识。',
  ASSISTANT_LIMIT: 'AI 消息发得有点快，稍后再试或改用本地知识。',
  ASSISTANT_IP_LIMIT: '这个网络短时间内的 AI 请求较多。',
  LOCAL_MODE_LIMIT: '本地消息发得有点快，请稍后再试。',
};

export class AssistantRequestError extends Error {
  constructor(
    readonly code: string,
    readonly retryAfter?: number,
    readonly reservation?: number,
  ) {
    super(assistantErrors[code] ?? '暂时无法连接睡前助手。');
  }
}

const availability = z.discriminatedUnion('available', [
  z.object({ available: z.literal(true) }),
  z.object({
    available: z.literal(false),
    code: z.string(),
    retryAfter: z.number().int().positive().optional(),
  }),
]);
export async function checkAssistantAvailability(
  provider: AssistantProviderId,
  model: string | undefined,
  reservation: number,
  signal: AbortSignal,
) {
  const query = new URLSearchParams({
    provider,
    reservation: String(reservation),
    ...(model ? { model } : {}),
  });
  const response = await fetch('/api/assistant/availability?' + query, {
    cache: 'no-store',
    credentials: 'omit',
    signal,
  });
  if (!response.ok) throw new Error('暂时无法查询站内额度。');
  return availability.parse(await response.json());
}

export async function readAssistant(
  messages: string[],
  mode: AssistantMode,
  signal: AbortSignal,
  accept: (event: AssistantEvent) => void,
  context: {
    provider?: AssistantProviderId;
    model?: string;
    previousReply?: string;
    earlierReply?: string;
    latestSentOn?: string;
    previousSentOn?: string;
    earlierSentOn?: string;
    olderHistory?: AssistantExchange[];
    prefersChat?: boolean;
  } = {},
) {
  const response = await fetch('/api/assistant/chat', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, mode, ...context }),
  });
  if (!response.ok) {
    const value = await response.json().catch(() => null);
    const header = response.headers.get('Retry-After');
    const seconds =
      header &&
      (/^\d+$/.test(header) ? Number(header) : Math.ceil((Date.parse(header) - Date.now()) / 1000));
    const reservation = Number(response.headers.get('X-JHaven-Reservation'));
    throw new AssistantRequestError(
      typeof value?.error?.code === 'string'
        ? value.error.code
        : response.status === 429
          ? 'proxy_rate'
          : 'unknown',
      typeof seconds === 'number' && Number.isSafeInteger(seconds)
        ? Math.max(0, seconds)
        : undefined,
      reservation > 0 && reservation <= 10 ? reservation : undefined,
    );
  }
  if (!response.body || !response.headers.get('content-type')?.includes('application/x-ndjson'))
    throw new Error('未收到可读取的回复。');
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '',
    size = 0,
    started = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16_000) throw new Error('回复超过读取上限。');
      buffer += value;
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (!line.trim()) continue;
        const event = assistantEvent.parse(JSON.parse(line));
        if (event.type === 'start') {
          if (started) throw new Error('回复格式异常。');
          started = true;
        } else if (!started) throw new Error('回复格式异常。');
        if (event.type === 'error') throw new AssistantRequestError(event.code, event.retryAfter);
        accept(event);
        if (event.type === 'done') return;
      }
    }
    throw new Error('回复连接中断，可以重试。');
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
