import { defineConfig, devices } from '@playwright/test';
import { testDatabaseUrl } from './apps/server/src/db/test-target.js';

const apiPort = process.env.PLAYWRIGHT_API_PORT ?? '3001';
const database = process.env.JHAVEN_TEST_POSTGRES === '1' ? process.env.DATABASE_URL : '';
if (process.env.JHAVEN_TEST_POSTGRES === '1') testDatabaseUrl(database);
const compat = process.env.PLAYWRIGHT_COMPAT_BROWSER;
if (compat && compat !== 'firefox' && compat !== 'webkit')
  throw new Error('PLAYWRIGHT_COMPAT_BROWSER 只接受 firefox 或 webkit。');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 3,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    ...(!compat && process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
  },
  projects: compat
    ? [
        {
          name: compat,
          use: {
            browserName: compat === 'firefox' ? 'firefox' : 'webkit',
            viewport: { width: 1440, height: 1000 },
          },
        },
      ]
    : [
        {
          name: 'desktop-1440',
          use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
        },
        {
          name: 'tablet-768',
          use: {
            ...devices['Desktop Chrome'],
            viewport: { width: 768, height: 1024 },
            hasTouch: true,
          },
        },
        {
          name: 'mobile-375',
          use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } },
        },
      ],
  webServer: [
    {
      command: 'node apps/server/dist/index.js',
      url: `http://127.0.0.1:${apiPort}/api/health`,
      env: {
        PORT: apiPort,
        HOST: '127.0.0.1',
        NODE_ENV: 'test',
        APP_ORIGIN: 'http://127.0.0.1:4173',
        TRUST_LOOPBACK_PROXY: '1',
        DEEPSEEK_API_KEY: '',
        AI_OPENAI_API_KEY: '',
        AI_DAILY_REQUEST_LIMIT: '0',
        DATABASE_URL: database ?? '',
      },
      reuseExistingServer: false,
    },
    {
      command: 'npm run preview -w @jhaven/web',
      url: 'http://127.0.0.1:4173',
      env: { JHAVEN_PROXY_PORT: apiPort },
      reuseExistingServer: false,
    },
  ],
});
