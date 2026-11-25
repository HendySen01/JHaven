import { expect, test, type Page } from '@playwright/test';
import { removeUnsupportedSafariApis } from './safari-api-probe.js';

const prefix = 'jhaven.page.view.v1:';
async function readyForPage(page: Page, key: string) {
  await expect
    .poll(() => page.evaluate((item) => Boolean(localStorage.getItem(item)), prefix + key))
    .toBe(true);
}
async function savedTop(page: Page, key: string) {
  return page.evaluate(
    (item) => JSON.parse(localStorage.getItem(item) ?? '{}').value?.top ?? -1,
    prefix + key,
  );
}
async function navigateWithoutMoving(page: Page, name: string) {
  // 从当前阅读位置发起 SPA 导航，不让测试框架先把导航按钮滚入视口。
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name, exact: true })
    .evaluate((element) => (element as HTMLElement).click());
}

test('首页和关于分别恢复刷新与跨页浏览位置，显式锚点优先', async ({ page }) => {
  await removeUnsupportedSafariApis(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 500 });
  await page.goto('/');
  await readyForPage(page, 'device:route:/');
  const homeTop = await page.evaluate(() => {
    window.scrollTo(0, Math.min(360, document.documentElement.scrollHeight - innerHeight));
    return scrollY;
  });
  expect(homeTop).toBeGreaterThan(20);
  await expect.poll(() => savedTop(page, 'device:route:/')).toBe(homeTop);
  await navigateWithoutMoving(page, '关于');
  await expect(page).toHaveURL('/about');
  await readyForPage(page, 'device:route:/about');
  const aboutTop = await page.evaluate(() => {
    window.scrollTo(0, Math.min(230, document.documentElement.scrollHeight - innerHeight));
    return scrollY;
  });
  expect(aboutTop).toBeGreaterThan(20);
  await expect.poll(() => savedTop(page, 'device:route:/about')).toBe(aboutTop);
  await navigateWithoutMoving(page, '今晚');
  await expect(page).toHaveURL('/');
  await expect
    .poll(() => page.evaluate((expected) => Math.abs(scrollY - expected), homeTop))
    .toBeLessThan(10);
  await page.reload();
  await expect
    .poll(() => page.evaluate((expected) => Math.abs(scrollY - expected), homeTop))
    .toBeLessThan(10);
  await navigateWithoutMoving(page, '关于');
  await expect
    .poll(() => page.evaluate((expected) => Math.abs(scrollY - expected), aboutTop))
    .toBeLessThan(10);
  await page
    .getByRole('link', { name: '使用边界与隐私' })
    .evaluate((node) => (node as HTMLElement).click());
  await expect(page).toHaveURL('/about#boundaries');
  await expect(page.locator('#boundaries')).toBeInViewport();
});

test('同一页面连续滚动、刷新与返回始终使用最后位置，恢复后不锁定滚动', async ({ page }) => {
  await page.addInitScript(() =>
    window.addEventListener('jhaven:page-recovered', () => {
      document.documentElement.dataset.testPageRecovered = 'true';
    }),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 480 });
  await page.goto('/about');
  await readyForPage(page, 'device:route:/about');
  const key = 'device:route:/about';
  for (const fraction of [0.85, 0.25, 0.55, 0]) {
    const top = await page.evaluate((part) => {
      window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * part));
      return scrollY;
    }, fraction);
    await expect.poll(() => savedTop(page, key)).toBe(top);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-test-page-recovered', 'true');
    await expect
      .poll(() => page.evaluate((expected) => Math.abs(scrollY - expected), top))
      .toBeLessThan(10);
    // 恢复后再次移动，不能被上一次定位的延迟回调拉回。
    await page.evaluate(() => window.scrollTo(0, 30));
    await expect.poll(() => savedTop(page, key)).toBe(30);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(30);
  }
  await navigateWithoutMoving(page, '今晚');
  await expect(page).toHaveURL('/');
  await navigateWithoutMoving(page, '关于');
  await expect(page).toHaveURL('/about');
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(30);
});

test('声音页切换到其他页面再回来，分类和音轨位置仍保留', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/relax');
  const player = page.locator('#ambient-player');
  await player.getByLabel('声音分类').selectOption('texture');
  const track = player.locator('[data-audio-view-anchor="track:crispy-squishy"]');
  await track.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  const before = await track.evaluate((node) => node.getBoundingClientRect().top);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('jhaven.audio.view.v1:/relax') ?? '{}');
        return saved.category === 'texture' && saved.scrollTop > 0;
      }),
    )
    .toBe(true);
  await navigateWithoutMoving(page, '关于');
  await expect(page).toHaveURL('/about');
  await readyForPage(page, 'device:route:/about');
  await navigateWithoutMoving(page, '声音场景');
  await expect(player.getByLabel('声音分类')).toHaveValue('texture');
  await expect
    .poll(() =>
      track.evaluate(
        (node, expected) => Math.abs(node.getBoundingClientRect().top - expected),
        before,
      ),
    )
    .toBeLessThan(12);
});

test('已保存聊天按账户恢复阅读位置，未发送草稿不写入本地', async ({ page }) => {
  await removeUnsupportedSafariApis(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const chat = '8a1ccabd-2dc6-4277-a83a-e67e7a11b8ad';
  const account = { id: '42', username: 'reading_test', createdAt: '2026-11-20T00:00:00Z' };
  const turns = Array.from({ length: 20 }, (_, index) => ({
    question: `测试问题 ${index}`,
    sentOn: '2026-11-20',
    text: '用于位置恢复的测试回复。'.repeat(8),
    source: 'local',
    note: '测试',
  }));
  let assistantRequests = 0;
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: account }));
  await page.route('**/api/account', (route) => route.fulfill({ json: account }));
  await page.route('**/api/space', (route) =>
    route.fulfill({ json: { presets: [], preferences: null } }),
  );
  await page.route('**/api/space/chat/settings', (route) =>
    route.fulfill({ json: { autoSave: false, epoch: 0 } }),
  );
  await page.route('**/api/space/chat/' + chat, (route) =>
    route.fulfill({
      json: {
        id: chat,
        revision: 1,
        title: '测试对话',
        updatedAt: '2026-11-20T00:00:00Z',
        messageCount: 40,
        sources: ['local'],
        providers: [],
        turns,
      },
    }),
  );
  await page.route('**/api/assistant/chat', (route) => {
    assistantRequests++;
    return route.abort();
  });
  await page.route('**/api/assistant/status', (route) =>
    route.fulfill({ json: { provider: null, knowledgeVersion: 'test' } }),
  );
  await page.addInitScript(
    ({ key, id }) => {
      // 只第一次预置已保存会话指针，刷新时使用实际写入的位置。
      if (!sessionStorage.getItem('test-seeded')) {
        localStorage.setItem(key, JSON.stringify({ at: Date.now(), value: id }));
        sessionStorage.setItem('test-seeded', 'yes');
      }
    },
    { key: prefix + 'account:42:last-chat', id: chat },
  );
  await page.goto('/assistant');
  const pane = page.getByRole('region', { name: '完整对话' });
  await expect(pane.getByText('测试问题 19', { exact: true })).toHaveCount(1);
  const before = await pane.evaluate((node) => {
    node.scrollTop = 200;
    return node.scrollTop;
  });
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? '{}').value?.following,
        prefix + 'account:42:chat:' + chat,
      ),
    )
    .toBe(false);
  await page.getByLabel('今晚想聊什么').fill('不应该持久化的草稿');
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('jhaven.page.view.v1:'))
        .some((key) => localStorage.getItem(key)?.includes('不应该持久化的草稿')),
    ),
  ).toBe(false);
  await page.reload();
  await expect(pane.getByText('测试问题 19', { exact: true })).toHaveCount(1);
  await expect
    .poll(() => pane.evaluate((node, expected) => Math.abs(node.scrollTop - expected), before))
    .toBeLessThan(12);
  await expect(page.getByLabel('今晚想聊什么')).toHaveValue('');
  expect(assistantRequests).toBe(0);
  // 用正常退出流程验证清除，而不是直接删本地存储。
  await page.route('**/api/space/relaxation', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 204 }));
  await page.getByRole('link', { name: '我的账户' }).click();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL('/login');
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((key) => key.startsWith('jhaven.page.view.v1:account:42:')),
    ),
  ).toBe(false);
});
