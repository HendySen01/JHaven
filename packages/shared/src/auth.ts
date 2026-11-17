import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9_]{3,32}$/i, '用户名请用 3–32 个英文字母、数字或下划线。')
  .transform((name) => name.toLowerCase());

export const newPasswordSchema = z
  .string()
  .min(12, '密码至少需要 12 个字符。')
  .max(128, '密码最多 128 个字符。');
export const credentialsSchema = z.strictObject({
  username: usernameSchema,
  password: z.string().min(1, '请输入密码。').max(128, '密码最多 128 个字符。'),
});
export const registrationSchema = credentialsSchema.extend({ password: newPasswordSchema });
export const accountSchema = z.strictObject({
  id: z.string().regex(/^\d+$/),
  username: z.string(),
  createdAt: z.iso.datetime(),
});
export type Account = z.infer<typeof accountSchema>;
