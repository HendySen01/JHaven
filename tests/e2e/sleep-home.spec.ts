import { expect, test } from '@playwright/test';

test('开始放松与三个场景详情，不会自动播放', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '开始放松' }).click();
  await expect(page).toHaveURL('/relax');
  for (const [name, id] of [
    ['雨夜', 'rain'],
    ['海岸', 'coast'],
    ['微风', 'breeze'],
  ]) {
    await page.getByRole('link', { name: `查看${name}场景` }).click();
    await expect(page).toHaveURL(`/relax/${id}`);
    await expect(page.getByRole('navigation').getByRole('link', { name: '声音场景' })).toHaveClass(
      /nav-active/,
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name!);
    await expect(page.getByText('CC0 实录 · 可混合播放')).toBeVisible();
    await expect(page.locator('.player-status')).toContainText('尚未播放');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await page.getByRole('link', { name: '返回场景选择' }).click();
    await expect(page.getByRole('link', { name: `查看${name}场景` })).toContainText('已选场景');
  }
  await page.reload();
  await expect(page.getByText('已选场景')).toHaveCount(1);
  await expect(page.locator('.player-status')).toContainText('尚未播放');
});

test('今晚状态实时更新建议并链接到对应入口', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: '思绪很多' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: '想听一些声音' })).toBeChecked();
  const choices = [
    ['思绪很多', '给思绪一点留白', '看看雨夜'],
    ['想听一些声音', '去海边，留一会儿', '看看海岸'],
    ['想安静放松', '为自己留一点安静', '看看微风'],
    ['想记录今天', '今天，也值得被轻轻记住', '了解睡眠日记'],
  ] as const;
  for (const [label, title, action] of choices) {
    await page.getByRole('radio', { name: label }).check();
    await expect(page.getByRole('status')).toContainText(title);
    await expect(page.getByRole('status').getByRole('link', { name: action })).toBeVisible();
  }
  await page.getByRole('status').getByRole('link', { name: '了解睡眠日记' }).click();
  await expect(page).toHaveURL('/journal');
  await expect(page.getByText('记录功能尚未开放', { exact: false })).toBeVisible();
  await expect(page.locator('textarea')).toHaveCount(0);
  await page.getByRole('link', { name: '回到今晚' }).click();
  await expect(page.getByRole('radio', { name: '想记录今天' })).toBeChecked();
  await page.reload();
  await expect(page.getByRole('radio', { name: '想记录今天' })).not.toBeChecked();
});

test('设置关闭、焦点限制、恢复焦点与本地偏好持久化', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: '打开设置' });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '关闭设置' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '完成设置' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '关闭设置' })).toBeFocused();
  await dialog.getByRole('radio', { name: '月光紫' }).check();
  await dialog.getByRole('switch', { name: '减少动画' }).check();
  await dialog.getByRole('switch', { name: '显示夜景' }).uncheck();
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'moonlight');
  await expect(page.locator('.night-scene')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'moonlight');
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
  await expect(page.locator('.night-scene')).toHaveCount(0);
  await trigger.click();
  await page.getByRole('button', { name: '恢复默认' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'night');
  await expect(page.locator('.night-scene')).toHaveCount(1);
  await page.getByRole('button', { name: '完成设置' }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('button', { name: '关闭设置' }).click();
  await expect(dialog).toHaveCount(0);
  await trigger.click();
  await page.mouse.click(1, 1);
  await expect(dialog).toHaveCount(0);
});

test('本地存储禁止时仍能调整，不宣称已保存', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '打开设置' }).click();
  await page.getByRole('radio', { name: '月光紫' }).check();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('本次调整已生效');
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'moonlight');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'night');
});

test('损坏偏好安全回退，系统减少动态效果优先', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('jhaven.ui-preferences.v1', '{broken'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'night');
  expect(
    await page
      .locator('.page-enter')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
  await page.getByRole('button', { name: '打开设置' }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('无法读取本地偏好');
  await expect(page.getByRole('switch', { name: '减少动画' })).not.toBeChecked();
});

test('所有页面在目标尺寸可浏览，深链接与无效场景可恢复', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const path of [
    '/',
    '/relax',
    '/relax/rain',
    '/relax/coast',
    '/relax/breeze',
    '/journal',
    '/about',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    if (path === '/')
      await page.screenshot({
        path: testInfo.outputPath('home.png'),
        fullPage: true,
        animations: 'disabled',
        scale: 'css',
      });
    if (path === '/about') await expect(page.getByRole('status')).toContainText('基础服务连接正常');
  }
  await page.goto('/relax/unknown');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('这处场景还不存在');
  await page.getByRole('link', { name: '返回场景选择' }).click();
  await expect(page).toHaveURL('/relax');
  expect(errors).toEqual([]);
});
