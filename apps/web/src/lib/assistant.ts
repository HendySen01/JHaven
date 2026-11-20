import {
  assistantEvent,
  type AssistantEvent,
  type AssistantMode,
  type AssistantProviderId,
} from '@jhaven/shared';

export const assistantErrors: Record<string, string> = {
  authentication: '模型认证失败，请联系站点维护者。可改用本地知识。',
  balance: '模型账户余额不足，可改用本地知识。',
  model_unavailable: '配置的模型暂不可用，可改用本地知识。',
  timeout: '这次回复超过等待时间，可以重试或使用本地知识。',
  upstream: '模型暂时不可用，可以重试或使用本地知识。',
  upstream_rate: '模型服务暂时限流，可以稍后重试或使用本地知识。',
  invalid_output: '这次模型回复未能通过检查，可以重试或使用本地知识。',
  MODEL_CONCURRENCY: 'JHaven 的 AI 请求正在排队，可以稍后再试。',
  unknown_provider_error: 'AI 供应商未能完成请求，可以改用本地知识。',
  proxy_rate: '连接暂时受到限流，服务未返回原因。请稍后再试。',
  MODEL_LIMIT: 'JHaven 的 AI 用量已达到今日上限，可以改用本地知识。',
  ASSISTANT_LIMIT: 'JHaven 请求过于频繁，请稍后再试。',
};

export class AssistantRequestError extends Error {
  constructor(
    readonly code: string,
    readonly retryAfter?: number,
  ) {
    super(assistantErrors[code] ?? '暂时无法连接睡前助手。');
  }
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
  } = {},
) {
  const response = await fetch('/api/assistant/chat', {
    method: 'POST',
    credentials: 'omit',
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
    throw new AssistantRequestError(
      typeof value?.error?.code === 'string'
        ? value.error.code
        : response.status === 429
          ? 'proxy_rate'
          : 'unknown',
      typeof seconds === 'number' && Number.isSafeInteger(seconds)
        ? Math.max(0, seconds)
        : undefined,
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
