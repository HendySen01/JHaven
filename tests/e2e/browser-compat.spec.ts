import { readdir, readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { removeUnsupportedSafariApis } from './safari-api-probe.js';

test('构建保留 Safari 15.6 可识别的响应式断点', async () => {
  test.skip(process.env.PLAYWRIGHT_WEB_DEV === '1', '此项检查生产构建。');
  const dir = new URL('../../apps/web/dist/assets/', import.meta.url);
  const files = (await readdir(dir)).filter((name) => name.endsWith('.css'));
  const css = (await Promise.all(files.map((name) => readFile(new URL(name, dir), 'utf8')))).join(
    '\n',
  );
  expect(css).toMatch(/@media\s*\([^)]*max-width:\s*820px/);
  expect(css).not.toMatch(/@media[^{;]*[<>]/);
});

test('各主要页面在窄屏无横向溢出，设置和连接检测可用', async ({ page }) => {
  test.setTimeout(60_000);
  await removeUnsupportedSafariApis(page);
  for (const width of [320, 375, 390, 768]) {
    await page.setViewportSize({ width, height: 812 });
    for (const path of ['/', '/relax', '/journal', '/assistant', '/login', '/register', '/about']) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.getByRole('navigation', { name: '主导航' })).toHaveCSS('display', 'grid');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
        `${path} @ ${width}px`,
      ).toBeLessThanOrEqual(1);
    }
  }
  await expect(page.getByText('基础服务连接正常')).toBeVisible();
  await page.getByRole('button', { name: '打开设置' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
