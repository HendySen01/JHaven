import { expect, test } from '@playwright/test';

test('首页、真实服务连接与导航可用', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('让世界慢一点');
  await expect(page.getByRole('link', { name: /查看.*场景/ })).toHaveCount(3);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await page.getByRole('link', { name: '关于', exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole('status')).toContainText('基础服务连接正常');
  await page.getByRole('button', { name: '重新检查' }).click();
  await expect(page.getByRole('status')).toContainText('基础服务连接正常');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('慢慢开始');
  await expect(page.getByRole('status')).toContainText('基础服务连接正常');
  expect(pageErrors).toEqual([]);
});

test('连接失败可显示错误并重试恢复', async ({ page }) => {
  await page.route('**/api/health', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/about');
  await expect(page.getByRole('status')).toContainText('暂时无法连接');
  await page.unroute('**/api/health');
  await page.getByRole('button', { name: '重新检查' }).click();
  await expect(page.getByRole('status')).toContainText('基础服务连接正常');
});

test('键盘跳转、窄屏布局与减少动态效果', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '跳到主要内容' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('link', { name: '探索夜晚的声音' }).click();
  await expect(page).toHaveURL(/#scenes$/);
});

test('不存在的地址能返回首页', async ({ page }) => {
  await page.goto('/unknown-page');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('这条小路');
  await page.getByRole('link', { name: '回到首页', exact: true }).click();
  await expect(page).toHaveURL('/');
});
