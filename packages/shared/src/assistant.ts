import { z } from 'zod';
import { practiceId } from './relaxation.js';

export const assistantScene = z.enum(['rain', 'coast', 'breeze']);
export const assistantMood = z.enum(['busy', 'noisy', 'sounds', 'quiet', 'awake']);
export const assistantAction = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('practice'), id: practiceId, mood: assistantMood }),
  z.strictObject({ kind: z.literal('scene'), id: assistantScene, mood: assistantMood }),
]);
export const assistantRequest = z.strictObject({
  messages: z.array(z.string().trim().min(1).max(400)).min(1).max(3),
  useModel: z.boolean(),
});
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
  provider: z.enum(['openai', 'deepseek']).nullable(),
  knowledgeVersion: z.string(),
});
export const assistantEvent = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('start'), mode: z.enum(['local', 'model']) }),
  z.strictObject({ type: z.literal('text'), text: z.string().min(1).max(400) }),
  z.strictObject({
    type: z.literal('done'),
    sources: z.array(assistantSource).max(3),
    actions: z.array(assistantAction).max(2),
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
    ]),
  }),
]);
export type AssistantEvent = z.infer<typeof assistantEvent>;
export type AssistantAction = z.infer<typeof assistantAction>;
