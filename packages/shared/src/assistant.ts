import { z } from 'zod';
import { practiceId } from './relaxation.js';

export const assistantScene = z.enum(['rain', 'coast', 'breeze']);
export const assistantMood = z.enum(['busy', 'noisy', 'sounds', 'quiet', 'awake']);
export const assistantAction = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('practice'), id: practiceId, mood: assistantMood }),
  z.strictObject({ kind: z.literal('scene'), id: assistantScene, mood: assistantMood }),
]);
const messages = z.array(z.string().trim().min(1).max(400)).min(1).max(3);
export const assistantHistoryLimit = 4;
const exchange = z.strictObject({
  user: z.string().trim().min(1).max(400),
  reply: z.string().trim().min(1).max(400),
});
export type AssistantExchange = z.infer<typeof exchange>;
export const assistantMode = z.enum(['ai', 'local']);
export type AssistantMode = z.infer<typeof assistantMode>;
export const assistantProviderId = z.enum(['openai', 'deepseek']);
export type AssistantProviderId = z.infer<typeof assistantProviderId>;
const modelName = z.string().regex(/^[\w.-]{1,80}$/);
export const assistantRequest = z.union([
  z.strictObject({
    messages,
    mode: assistantMode,
    provider: assistantProviderId.optional(),
    model: modelName.optional(),
    previousReply: z.string().trim().min(1).max(400).optional(),
    earlierReply: z.string().trim().min(1).max(400).optional(),
    olderHistory: z
      .array(exchange)
      .max(assistantHistoryLimit - 2)
      .optional(),
  }),
  z.strictObject({ messages, useModel: z.boolean() }).transform(({ messages, useModel }) => ({
    messages,
    mode: useModel ? ('ai' as const) : ('local' as const),
    provider: undefined,
    model: undefined,
    previousReply: undefined,
    earlierReply: undefined,
    olderHistory: undefined,
  })),
]);
export const assistantSource = z.strictObject({
  id: z.string().regex(/^[a-z-]+$/),
  title: z.string().min(1).max(120),
  url: z.url({ protocol: /^https$/ }),
  published: z.iso.date(),
  population: z.string().min(1).max(160),
  evidence: z.string().min(1).max(160),
  limits: z.string().min(1).max(200),
  summary: z.string().min(1).max(240),
});
export const assistantStatus = z.strictObject({
  provider: assistantProviderId.nullable(),
  providers: z
    .array(z.strictObject({ id: assistantProviderId, model: modelName }))
    .max(2)
    .optional(),
  knowledgeVersion: z.string(),
});
export const assistantEvent = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('start'),
    mode: z.enum(['local', 'model']),
    source: z.enum(['fallback', 'local']).optional(),
  }),
  z.strictObject({ type: z.literal('text'), text: z.string().min(1).max(400) }),
  z.strictObject({
    type: z.literal('done'),
    source: z.literal('ai').optional(),
    sources: z.array(assistantSource).max(3),
    actions: z.array(assistantAction).max(2),
    reason: z.string().min(1).max(100).optional(),
  }),
  z.strictObject({
    type: z.literal('error'),
    code: z.enum([
      'timeout',
      'upstream',
      'upstream_rate',
      'invalid_output',
      'authentication',
      'balance',
      'model_unavailable',
      'unknown_provider_error',
    ]),
    retryAfter: z.number().int().nonnegative().optional(),
  }),
]);
export type AssistantEvent = z.infer<typeof assistantEvent>;
export type AssistantAction = z.infer<typeof assistantAction>;
export type AssistantSource = z.infer<typeof assistantSource>;
