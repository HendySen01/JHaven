import { expect, test } from '@playwright/test';
import { installAudioProbe, readAudioProbe } from './audio-probe.js';

for (const single of [true, false]) {
  test(`无定时${single ? '单轨' : '多轨'}刷新后可从原播放按钮恢复`, async ({ page }) => {
    await installAudioProbe(page);
    await page.goto('/relax');
    const player = page.locator('#ambient-player');
    const switches = player.getByRole('switch');
    for (const control of await switches.all()) await control.uncheck();
    await player.getByRole('switch', { name: '开启雨声', exact: true }).check();
    if (!single) await player.getByRole('switch', { name: '开启海浪', exact: true }).check();
    await player.getByRole('button', { name: '播放混音', exact: true }).click();
    await expect(player.locator('.player-status')).toContainText('正在播放');
    await expect(player.locator('.timer-remaining')).toHaveText('不定时');
    await page.reload();
    expect((await readAudioProbe(page)).contexts).toBe(0);
    await expect(player.getByRole('button', { name: '恢复上次混音' })).toBeVisible();
    await player.getByRole('button', { name: '恢复上次混音' }).click();
    await expect(player.locator('.player-status')).toContainText('正在播放');
    await expect(player.locator('.timer-remaining')).toHaveText('不定时');
    await expect.poll(async () => (await readAudioProbe(page)).active).toBe(single ? 1 : 2);
    await player.getByRole('button', { name: '停止', exact: true }).click();
    await expect(player.locator('.player-status')).toContainText('尚未播放');
    await page.reload();
    await expect(player.getByRole('button', { name: '恢复上次混音' })).toHaveCount(0);
  });
}

test('刷新保留声音分类、搜索及下方音轨位置，不自动出声', async ({ page }) => {
  await installAudioProbe(page);
  await page.goto('/relax');
  const player = page.locator('#ambient-player');
  await player.getByRole('button', { name: '播放混音', exact: true }).click();
  await expect(player.locator('.player-status')).toContainText('正在播放');
  await player.getByLabel('声音分类').selectOption('texture');
  const track = player.locator('[data-audio-view-anchor="track:crispy-squishy"]');
  await track.evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const before = await track.evaluate((node) => node.getBoundingClientRect().top);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('jhaven.audio.view.v1:/relax');
        const saved = raw ? JSON.parse(raw) : null;
        const anchor =
          saved?.anchor &&
          [...document.querySelectorAll<HTMLElement>('[data-audio-view-anchor]')].find(
            (node) => node.dataset.audioViewAnchor === saved.anchor,
          );
        return Boolean(
          anchor && Math.abs(anchor.getBoundingClientRect().top - saved.anchorOffset) < 2,
        );
      }),
    )
    .toBe(true);
  await page.reload();
  await expect(player.getByLabel('声音分类')).toHaveValue('texture');
  await expect(player.getByRole('button', { name: '恢复上次混音' })).toHaveCount(1);
  await expect
    .poll(() =>
      track.evaluate((node, offset) => Math.abs(node.getBoundingClientRect().top - offset), before),
    )
    .toBeLessThan(12);
  expect((await readAudioProbe(page)).contexts).toBe(0);
  await player.getByRole('searchbox', { name: '搜索声音' }).fill('脆皮捏捏');
  await page.reload();
  await expect(player.getByRole('searchbox', { name: '搜索声音' })).toHaveValue('脆皮捏捏');
  await expect(track).toBeVisible();
});

test('声音页先到底部再往上，反复刷新恢复最新位置而不是固定音轨', async ({ page }) => {
  await page.addInitScript(() =>
    window.addEventListener('jhaven:page-recovered', () => {
      document.documentElement.dataset.testPageRecovered = 'true';
    }),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/relax');
  const player = page.locator('#ambient-player');
  const stored = () =>
    page.evaluate(
      () => JSON.parse(localStorage.getItem('jhaven.audio.view.v1:/relax') ?? '{}').scrollTop ?? -1,
    );
  await expect.poll(stored).toBeGreaterThanOrEqual(0);
  for (const id of ['crispy-squishy', 'rain', 'fan', 'crispy-squishy']) {
    const track = player.locator(`[data-audio-view-anchor="track:${id}"]`);
    await track.evaluate((node) => node.scrollIntoView({ block: 'center' }));
    const before = await track.evaluate((node) => ({
      offset: node.getBoundingClientRect().top,
      top: scrollY,
    }));
    await expect.poll(stored).toBe(Math.round(before.top));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-test-page-recovered', 'true');
    await expect
      .poll(() =>
        track.evaluate(
          (node, offset) => Math.abs(node.getBoundingClientRect().top - offset),
          before.offset,
        ),
      )
      .toBeLessThan(12);
  }
});
