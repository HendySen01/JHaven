import { z } from 'zod';
import { assistantEvent } from './assistant.js';

export const chatSources = z.enum(['ai', 'local', 'fallback', 'error']);
export const chatFilter = z.enum(['all', 'deepseek', 'local', 'mixed']);
export const chatTitle = z.string().trim().min(1).max(100);
const result = assistantEvent.options[2];
export const chatTurn = z
  .strictObject({
    question: z.string().min(1).max(400),
    sentOn: z.iso.date(),
    text: z.string().max(16_000),
    source: chatSources,
    result: result.optional(),
    recipient: z
      .string()
      .regex(/^(?:DeepSeek|OpenAI)(?: · [^\r\n]{1,120})?$/)
      .optional(),
    note: z.string().max(500).optional(),
  })
  .refine((turn) => !!turn.result || !!turn.note);
export const chatSettings = z.object({
  autoSave: z.boolean(),
  epoch: z.number().int().nonnegative(),
});
export const chatSummary = z.object({
  id: z.uuid(),
  revision: z.number().int().positive(),
  title: chatTitle,
  updatedAt: z.iso.datetime(),
  messageCount: z.number().int().positive(),
  sources: z.array(chatSources),
  providers: z.array(z.enum(['deepseek', 'openai'])),
});
export const chatDetail = chatSummary.extend({ turns: z.array(chatTurn) });
export const chatSnapshot = z.strictObject({
  revision: z.number().int().nonnegative().max(2_000_000_000),
  epoch: z.number().int().nonnegative().max(2_000_000_000),
  automatic: z.boolean(),
  turns: z.array(chatTurn).min(1).max(500),
});
export type ChatTurn = z.infer<typeof chatTurn>;
export type ChatSummary = z.infer<typeof chatSummary>;
export type ChatFilter = z.infer<typeof chatFilter>;
