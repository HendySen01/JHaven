import { z } from 'zod';
import type { AssistantProviderId } from '@jhaven/shared';

export interface AssistantProvider {
  readonly name: AssistantProviderId;
  readonly model?: string;
  choose(
    message: string,
    signal: AbortSignal,
    system: string,
    detailed?: boolean,
  ): Promise<unknown>;
}
export class ProviderError extends Error {
  constructor(
    readonly code:
      | 'upstream'
      | 'upstream_rate'
      | 'invalid_output'
      | 'authentication'
      | 'balance'
      | 'model_unavailable'
      | 'timeout'
      | 'unknown_provider_error',
    readonly retryAfter?: number,
  ) {
    super(code);
  }
}
function retryAfter(value: string | null) {
  if (!value) return;
  const seconds = /^\d+$/.test(value)
    ? Number(value)
    : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  if (Number.isSafeInteger(seconds)) return Math.max(0, seconds);
}
const chunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z.object({ content: z.string().nullish() }),
        finish_reason: z.string().nullable(),
      }),
    )
    .max(1),
});
export function openAiProvider(
  key: string,
  model: string,
  fetcher = fetch,
  baseUrl = 'https://api.openai.com/v1',
): AssistantProvider {
  if (baseUrl !== 'https://api.openai.com/v1') throw new Error('OpenAI 地址必须为官方 HTTPS 接口');
  return chatProvider(key, model, baseUrl, 'openai', fetcher);
}
export function deepSeekProvider(
  key: string,
  model: string,
  baseUrl: string,
  fetcher = fetch,
): AssistantProvider {
  if (!['https://api.deepseek.com', 'https://api.deepseek.com/v1'].includes(baseUrl))
    throw new Error('DeepSeek 地址必须为官方 HTTPS 接口');
  return chatProvider(key, model, baseUrl, 'deepseek', fetcher);
}
function chatProvider(
  key: string,
  model: string,
  baseUrl: string,
  name: AssistantProvider['name'],
  fetcher: typeof fetch,
): AssistantProvider {
  return {
    name,
    model,
    async choose(message, signal, system, detailed = false) {
      const response = await fetcher(baseUrl + '/chat/completions', {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: true,
          ...(name === 'deepseek'
            ? {
                max_tokens: detailed ? 1024 : 192,
                thinking: { type: detailed ? 'enabled' : 'disabled' },
                ...(detailed ? { reasoning_effort: 'low' } : {}),
              }
            : { store: false, max_completion_tokens: detailed ? 768 : 192 }),
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: message },
          ],
        }),
      });
      if (
        !response.ok ||
        !response.body ||
        !response.headers.get('content-type')?.includes('text/event-stream')
      ) {
        await response.body?.cancel().catch(() => undefined);
        const codes: Record<number, ProviderError['code']> = {
          401: 'authentication',
          402: 'balance',
          403: 'authentication',
          404: 'model_unavailable',
          422: 'model_unavailable',
          429: 'upstream_rate',
          408: 'timeout',
          504: 'timeout',
        };
        throw new ProviderError(
          codes[response.status] ??
            (response.status >= 500 ? 'upstream' : 'unknown_provider_error'),
          retryAfter(response.headers.get('retry-after')),
        );
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '',
        output = '',
        size = 0,
        finished = false;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 192_000) throw new ProviderError('invalid_output');
          buffer += value;
          let newline = buffer.indexOf('\n');
          while (newline !== -1) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf('\n');
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') {
              if (!finished) throw new ProviderError('invalid_output');
              return JSON.parse(output) as unknown;
            }
            const part = chunkSchema.parse(JSON.parse(data)).choices[0];
            if (!part) continue;
            output += part.delta.content ?? '';
            if (output.length > 4096) throw new ProviderError('invalid_output');
            if (part.finish_reason && part.finish_reason !== 'stop')
              throw new ProviderError('invalid_output');
            finished ||= part.finish_reason === 'stop';
          }
        }
        throw new ProviderError('upstream');
      } catch (error) {
        if (signal.aborted) throw error;
        if (error instanceof ProviderError) throw error;
        throw new ProviderError(
          error instanceof SyntaxError || error instanceof z.ZodError
            ? 'invalid_output'
            : 'upstream',
        );
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    },
  };
}
