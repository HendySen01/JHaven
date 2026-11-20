import { z } from 'zod';
import type { AssistantProviderId } from '@jhaven/shared';

const tokenUsage = z.object({
  prompt_tokens: z.number().int().min(0).max(2_000_000),
  completion_tokens: z.number().int().min(0).max(2_000_000),
});
export type TokenUsage = z.infer<typeof tokenUsage>;

export interface AssistantProvider {
  readonly name: AssistantProviderId;
  readonly model?: string;
  choose(
    message: string,
    signal: AbortSignal,
    system: string,
    detailed?: boolean,
    reportUsage?: (usage: TokenUsage) => void,
  ): Promise<unknown>;
}

function outputLimit(name: AssistantProviderId, detailed: boolean) {
  return detailed ? (name === 'deepseek' ? 1024 : 768) : 192;
}

export function estimateCost(
  provider: AssistantProvider,
  system: string,
  message: string,
  detailed: boolean,
  usage?: TokenUsage,
) {
  // 用公开高峰价、不依赖缓存折扣。未审核的 OpenAI 型号使用更高的占位价。
  const [inputRate, outputRate] =
    provider.name === 'deepseek'
      ? provider.model === 'deepseek-v4-pro'
        ? [1.32, 3.96]
        : [0.3, 1.2]
      : !provider.model || /^gpt-4\.1-mini(?:-2025-04-14)?$/.test(provider.model)
        ? [0.4, 1.6]
        : [30, 180];
  const input =
    usage?.prompt_tokens ?? Buffer.byteLength(system) + Buffer.byteLength(message) + 128;
  const output = usage?.completion_tokens ?? outputLimit(provider.name, detailed);
  return (input * inputRate + output * outputRate) / 1_000_000;
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
    async choose(message, signal, system, detailed = false, reportUsage) {
      const response = await fetcher(baseUrl + '/chat/completions', {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: true,
          stream_options: { include_usage: true },
          ...(name === 'deepseek'
            ? {
                max_tokens: outputLimit(name, detailed),
                thinking: { type: detailed ? 'enabled' : 'disabled' },
                ...(detailed ? { reasoning_effort: 'low' } : {}),
              }
            : { store: false, max_completion_tokens: outputLimit(name, detailed) }),
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
            const frame = JSON.parse(data) as { usage?: unknown };
            const usage = tokenUsage.safeParse(frame.usage);
            if (usage.success) reportUsage?.(usage.data);
            const part = chunkSchema.parse(frame).choices[0];
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
