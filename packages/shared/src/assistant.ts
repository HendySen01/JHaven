import { z } from 'zod';
import { practiceId } from './relaxation.js';

export const assistantScene = z.enum(['rain', 'coast', 'breeze']);
export const assistantMood = z.enum(['busy', 'noisy', 'sounds', 'quiet', 'awake']);
export const assistantAction = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('practice'), id: practiceId, mood: assistantMood }),
  z.strictObject({ kind: z.literal('scene'), id: assistantScene, mood: assistantMood }),
]);
const messages = z.array(z.string().trim().min(1).max(400)).min(1).max(3);
export const assistantHistoryLimit = 6;
export const assistantRecentHistory = 4;
export const assistantHistoryBytes = 9_600;
const exchange = z.strictObject({
  user: z.string().trim().min(1).max(400),
  reply: z.string().trim().min(1).max(400),
  sentOn: z.iso.date().optional(),
});
export type AssistantExchange = z.infer<typeof exchange>;
export const assistantExchangeBytes = (turn: AssistantExchange) =>
  new TextEncoder().encode(JSON.stringify(turn)).length;
export const assistantPrefersChat = (text: string) =>
  /(?:^|[，。！？、；,.;!?\s])(?:我(?:又|现在)?)?(?:(?:只想|就是想|就想|只是想).{0,8}(?:闲聊|聊(?:天|两句)?)(?=[，。！？、,.!?;\s]|$)|(?:不用|不想听|不要|别再?|不需要).{0,6}(?:建议|说教|上课)|不是来.{0,8}(?:上课|听课|听建议))/.test(
    text.normalize('NFKC'),
  );
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
    prefersChat: z.boolean().optional(),
    previousReply: z.string().trim().min(1).max(400).optional(),
    earlierReply: z.string().trim().min(1).max(400).optional(),
    latestSentOn: z.iso.date().optional(),
    previousSentOn: z.iso.date().optional(),
    earlierSentOn: z.iso.date().optional(),
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
    prefersChat: undefined,
    previousReply: undefined,
    earlierReply: undefined,
    latestSentOn: undefined,
    previousSentOn: undefined,
    earlierSentOn: undefined,
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
export const assistantFallbackCode = z.enum([
  'authorization_required',
  'provider_unavailable',
  'provider_invalid_output',
  'invalid_structure',
  'output_rejected',
  'evidence_unavailable',
]);
export type AssistantFallbackCode = z.infer<typeof assistantFallbackCode>;
export const assistantEvent = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('start'),
    mode: z.enum(['local', 'model']),
    source: z.enum(['fallback', 'local']).optional(),
    fallbackCode: assistantFallbackCode.optional(),
    inputRestricted: z.literal(true).optional(),
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
      'stream_interrupted',
      'provider_content_filtered',
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
