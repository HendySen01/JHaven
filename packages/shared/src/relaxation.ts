import { z } from 'zod';

export const practiceIds = ['thoughts', 'body', 'breathing', 'unwind'] as const;
export const practiceId = z.enum(practiceIds);
export type PracticeId = z.infer<typeof practiceId>;
export const relaxationInput = z.strictObject({
  id: z.uuid(),
  practice: practiceId,
  seconds: z.number().int().min(0).max(600),
  completed: z.boolean(),
});
export const relaxationRecord = relaxationInput.extend({ createdAt: z.iso.datetime() });
