import type { Page } from '@playwright/test';

export async function removeUnsupportedSafariApis(page: Page) {
  // 只复现缺少的 API，不改变浏览器引擎或声称模拟真机。
  await page.addInitScript(() => {
    Reflect.deleteProperty(AbortSignal, 'timeout');
    Reflect.deleteProperty(AbortSignal, 'any');
  });
}
