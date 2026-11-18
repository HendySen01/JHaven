import { assistantEvent, type AssistantEvent } from '@jhaven/shared';

export const assistantErrors: Record<string, string> = {
  authentication: '模型认证失败，请联系站点维护者。可改用本地知识。',
  balance: '模型账户余额不足，可改用本地知识。',
  model_unavailable: '配置的模型暂不可用，可改用本地知识。',
  timeout: '这次回复超过等待时间，可以重试或使用本地知识。',
  upstream: '模型暂时不可用，可以重试或使用本地知识。',
  upstream_rate: '模型服务暂时限流，可以稍后重试或使用本地知识。',
  invalid_output: '这次模型回复未能通过检查，可以重试或使用本地知识。',
  MODEL_LIMIT: '模型额度暂不可用，可以改用本地知识。',
  ASSISTANT_LIMIT: '请求有点多，稍后再试。',
};

export async function readAssistant(
  messages: string[],
  useModel: boolean,
  signal: AbortSignal,
  accept: (event: AssistantEvent) => void,
) {
  const response = await fetch('/api/assistant/chat', {
    method: 'POST',
    credentials: 'omit',
    cache: 'no-store',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, useModel }),
  });
  if (!response.ok) {
    const value = await response.json().catch(() => null);
    throw new Error(assistantErrors[value?.error?.code] ?? '暂时无法连接睡前助手。');
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
        if (event.type === 'error') throw new Error(assistantErrors[event.code]);
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
