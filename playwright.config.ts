import { defineConfig, devices } from '@playwright/test';

const apiPort = process.env.PLAYWRIGHT_API_PORT ?? '3001';

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
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  },
  projects: [
    {
      name: 'desktop-1440',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'tablet-768',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, hasTouch: true },
    },
    { name: 'mobile-375', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } } },
  ],
  webServer: [
    {
      command: 'npm run start -w @jhaven/server',
      url: `http://127.0.0.1:${apiPort}/api/health`,
      env: {
        PORT: apiPort,
        HOST: '127.0.0.1',
        NODE_ENV: 'test',
        APP_ORIGIN: 'http://127.0.0.1:4173',
        TRUST_LOOPBACK_PROXY: '1',
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
