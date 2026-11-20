import { z } from 'zod';
import catalog from './sound-catalog.json' with { type: 'json' };

export const TRACKS = catalog;
export type TrackId = keyof typeof catalog;
export const TRACK_IDS = Object.keys(catalog) as TrackId[];
const volume = z.number().min(0).max(100);
const mixSchema = z.record(z.enum(TRACK_IDS), z.strictObject({ enabled: z.boolean(), volume }));
export const presetInput = z.strictObject({
  name: z.string().trim().min(1).max(40),
  mix: z
    .preprocess(
      (value) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? {
              'soft-chew': { enabled: false, volume: 40 },
              'gentle-crinkle': { enabled: false, volume: 40 },
              ...value,
            }
          : value,
      mixSchema,
    )
    .refine((mix) => TRACK_IDS.some((key) => mix[key].enabled), '请至少启用一条音轨。'),
});
export const accountPreset = presetInput.extend({ id: z.uuid() });
export type AccountPreset = z.infer<typeof accountPreset>;
export const builtinIds = ['rain', 'coast', 'breeze', 'brook', 'steady'] as const;
export const spacePreferences = z.strictObject({
  scene: z
    .union([
      z.strictObject({ kind: z.literal('builtin'), id: z.enum(builtinIds) }),
      z.strictObject({ kind: z.literal('preset'), id: z.uuid() }),
    ])
    .nullable(),
  volume,
  timerMinutes: z.number().int().min(0).max(180),
});
export type SpacePreferences = z.infer<typeof spacePreferences>;

export const journalDate = z.iso
  .date()
  .refine((value) => value >= '1900-01-01' && value <= '2099-12-31');
export const journalTimezone = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => {
    if (!/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(value)) return false;
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, '时区必须是有效的 IANA 时区。');
const moment = z.iso
  .datetime({ precision: 0 })
  .refine((value) => journalDate.safeParse(value.slice(0, 10)).success)
  .nullable();
export const journalInput = z
  .strictObject({
    date: journalDate,
    timezone: journalTimezone,
    bedtime: moment,
    asleep: moment,
    wake: moment,
    rest: z.number().int().min(1).max(5).nullable(),
    note: z.string().trim().max(2000),
  })
  .superRefine((entry, ctx) => {
    const known = [entry.bedtime, entry.asleep, entry.wake].filter(
      (time): time is string => time !== null,
    );
    if (known.some((time, i) => i > 0 && time < known[i - 1]!))
      ctx.addIssue({ code: 'custom', message: '请按上床、入睡、醒来的顺序填写实际日期和时间。' });
    if (!known.length && entry.rest === null && !entry.note)
      ctx.addIssue({ code: 'custom', message: '请至少填写一项时间、休息感或备注。' });
  });
export const journalEntry = journalInput.safeExtend({ id: z.uuid() });
export const journalEntries = z.array(journalEntry);
export type JournalInput = z.infer<typeof journalInput>;
export type JournalEntry = z.infer<typeof journalEntry>;
export const journalRange = z
  .strictObject({ from: journalDate, to: journalDate })
  .refine(
    ({ from, to }) => from <= to && (Date.parse(to) - Date.parse(from)) / 86400000 < 366,
    '查询范围最多 366 天，开始日期须在结束日期之前。',
  );
export const personalSpace = z.strictObject({
  presets: z.array(accountPreset),
  preferences: spacePreferences.nullable(),
});
