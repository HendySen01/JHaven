import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  APP_ORIGIN: z.url().optional(),
  DB_HOST: z.string().trim().min(1).optional(),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_NAME: z
    .string()
    .regex(/^[a-zA-Z0-9_]{1,64}$/)
    .optional(),
  DB_USER: z.string().trim().min(1).optional(),
  DB_PASSWORD: z.string().optional(),
  DB_TLS: z.enum(['0', '1']).default('0'),
  TRUST_LOOPBACK_PROXY: z.enum(['0', '1']).default('0'),
  AI_OPENAI_API_KEY: z.string().trim().max(512).optional(),
  AI_OPENAI_BASE_URL: z.literal('https://api.openai.com/v1').default('https://api.openai.com/v1'),
  AI_VERIFIED_OPENAI_MODEL: z
    .string()
    .regex(/^[\w.-]{0,80}$/)
    .optional(),
  AI_OPENAI_MODEL: z
    .string()
    .regex(/^[\w.-]{1,80}$/)
    .default('gpt-4.1-mini'),
  AI_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(0).max(500).default(120),
  AI_ACCOUNT_WINDOW_LIMIT: z.coerce.number().int().min(1).max(180).default(60),
  AI_GUEST_WINDOW_LIMIT: z.coerce.number().int().min(1).max(90).default(30),
  AI_IP_WINDOW_LIMIT: z.coerce.number().int().min(1).max(500).default(180),
  DEEPSEEK_API_KEY: z.string().trim().max(512).optional(),
  DEEPSEEK_BASE_URL: z
    .enum(['https://api.deepseek.com', 'https://api.deepseek.com/v1'])
    .default('https://api.deepseek.com'),
  DEEPSEEK_MODEL: z.enum(['deepseek-flash', 'deepseek-v4-pro']).default('deepseek-flash'),
  AI_VERIFIED_DEEPSEEK_MODEL: z
    .enum(['', 'deepseek-flash', 'deepseek-v4-pro'])
    .default('deepseek-flash'),
  AI_OPENAI_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(0).max(500).default(120),
  AI_DEEPSEEK_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(0).max(500).default(120),
  AI_OPENAI_DAILY_BUDGET_USD: z.coerce.number().min(0).max(10).default(0.1),
  AI_DEEPSEEK_DAILY_BUDGET_USD: z.coerce.number().min(0).max(10).default(0.1),
  AI_DAILY_BUDGET_USD: z.coerce.number().min(0).max(10).default(0.1),
});

export function loadConfig(environment: NodeJS.ProcessEnv = process.env) {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join('、');
    throw new Error(`环境配置无效，请检查：${fields}`);
  }
  const config = result.data;
  const origin = config.APP_ORIGIN ?? 'http://127.0.0.1:5173';
  const parsedOrigin = new URL(origin);
  if (
    parsedOrigin.origin !== origin ||
    !['http:', 'https:'].includes(parsedOrigin.protocol) ||
    (config.NODE_ENV === 'production' && parsedOrigin.protocol !== 'https:')
  ) {
    throw new Error('APP_ORIGIN 必须是完整站点来源（无路径），生产环境必须使用 HTTPS。');
  }
  const databaseFields = [config.DB_HOST, config.DB_NAME, config.DB_USER, config.DB_PASSWORD];
  if (
    databaseFields.some((field) => field !== undefined) &&
    databaseFields.some((field) => field === undefined)
  ) {
    throw new Error('数据库配置不完整，请检查 DB_HOST、DB_NAME、DB_USER 和 DB_PASSWORD。');
  }
  if (config.NODE_ENV === 'production' && config.DB_HOST && !config.DB_PASSWORD) {
    throw new Error('生产数据库必须配置凭据。');
  }
  return { ...config, APP_ORIGIN: origin };
}
export type Config = ReturnType<typeof loadConfig>;
