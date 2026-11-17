import { expect, test } from '@playwright/test';
import { installAudioProbe, readAudioProbe } from './audio-probe.js';

test.beforeEach(async ({ page }) => {
  await installAudioProbe(page);
});

test('声音库筛选、收藏、单独试听、默认收声选项及静音', async ({ page }) => {
  await page.goto('/relax');
  const player = page.locator('#ambient-player');
  await player.getByRole('combobox', { name: '声音分类' }).selectOption('steady');
  await expect(player.getByRole('switch')).toHaveCount(3);
  await player.getByRole('searchbox', { name: '搜索声音' }).fill('pink');
  await expect(player.getByRole('switch')).toHaveCount(1);
  await player.getByRole('button', { name: '收藏粉红噪音' }).click();
  await player.getByRole('button', { name: '试听粉红噪音', exact: true }).click();
  await expect.poll(async () => (await readAudioProbe(page)).rms).toBeGreaterThan(0.00001);
  expect(await readAudioProbe(page)).toMatchObject({ contexts: 1, active: 1, decoded: 1 });
  await player.getByRole('button', { name: '静音', exact: true }).click();
  await expect.poll(async () => (await readAudioProbe(page)).rms).toBe(0);
  await player.getByRole('button', { name: '取消静音' }).click();
  await expect.poll(async () => (await readAudioProbe(page)).rms).toBeGreaterThan(0.00001);
  await player.getByRole('button', { name: '停止试听粉红噪音' }).click();
  await expect(player.getByRole('switch', { name: '开启粉红噪音' })).not.toBeChecked();
  await expect(player.getByRole('combobox', { name: '停止时间' })).toHaveValue('20');
  await page.reload();
  await player.getByRole('combobox', { name: '声音分类' }).selectOption('favorites');
  await expect(player.getByRole('button', { name: '收藏粉红噪音' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await player.getByRole('link', { name: '用途与研究依据' }).click();
  await expect(page.getByRole('heading', { name: '声音用途与研究依据' })).toBeVisible();
});

test('完整目录的十条 WAV 在同一原生音频图解码和混合', async ({ page }) => {
  await page.goto('/relax');
  const player = page.locator('#ambient-player');
  const switches = await player.getByRole('switch').all();
  expect(switches).toHaveLength(10);
  for (const track of switches) await track.check();
  await player.getByRole('button', { name: '播放混音', exact: true }).click();
  await expect(player.locator('.player-status')).toContainText('正在播放');
  await expect.poll(async () => (await readAudioProbe(page)).rms).toBeGreaterThan(0.00001);
  expect(await readAudioProbe(page)).toMatchObject({ contexts: 1, active: 10, decoded: 10 });
  expect(
    await page.evaluate(() =>
      [...window.__jhavenAudioProbe.voices].every(
        (voice) =>
          voice.loop && voice.buffer!.getChannelData(0).some((sample) => Math.abs(sample) > 0.001),
      ),
    ),
  ).toBe(true);
  await player.getByRole('button', { name: '停止', exact: true }).click();
  await expect.poll(async () => (await readAudioProbe(page)).active).toBe(0);
});

test('返回详情保留自定义混音，损坏或受限存储可恢复', async ({ page }) => {
  await page.goto('/relax/rain');
  const player = page.locator('#ambient-player');
  await player.getByRole('slider', { name: '雨声音量', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  const volume = await player.getByRole('slider', { name: '雨声音量', exact: true }).inputValue();
  await page.getByRole('navigation').getByRole('link', { name: '关于', exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('从一个安静的起点');
  await page.goBack();
  await expect(page).toHaveURL(/\/relax\/rain$/);
  await expect(player.getByRole('slider', { name: '雨声音量', exact: true })).toHaveValue(volume);
  await page.evaluate(() => localStorage.setItem('jhaven.audio.v1', '{broken'));
  await page.reload();
  await expect(player.getByRole('slider', { name: '雨声音量', exact: true })).toHaveValue('65');
  await expect(player.getByText('本地声音偏好无法读取', { exact: false })).toBeVisible();
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
  });
  await page.reload();
  await player.getByRole('textbox', { name: '自定义场景名称' }).fill('临时夜晚');
  await player.getByRole('button', { name: '另存场景', exact: true }).click();
  await expect(player.getByText('场景仅保留在本次访问中', { exact: false })).toBeVisible();
  await page.reload();
  await expect(player.getByRole('button', { name: '临时夜晚', exact: true })).toHaveCount(0);
});

test('三条授权音轨真实解码与混合，暂停/继续/停止无叠加', async ({ page }) => {
  await page.goto('/relax');
  const player = page.locator('#ambient-player');
  expect((await readAudioProbe(page)).contexts).toBe(0);
  await player.getByRole('switch', { name: '开启海浪' }).check();
  await player.getByRole('button', { name: '播放混音', exact: true }).click();
  await expect(player.locator('.player-status')).toContainText('正在播放');
  await expect.poll(async () => (await readAudioProbe(page)).rms).toBeGreaterThan(0.00001);
  expect(await readAudioProbe(page)).toMatchObject({ contexts: 1, active: 3, decoded: 3 });
  expect(
    await page.evaluate(() =>
      [...window.__jhavenAudioProbe.voices].every((source) =>
        source.buffer!.getChannelData(0).some((value) => Math.abs(value) > 0.001),
      ),
    ),
  ).toBe(true);
  for (const label of ['雨声音量', '海浪音量', '微风音量']) {
    await player.getByRole('slider', { name: label, exact: true }).focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await expect(player.getByRole('slider', { name: label, exact: true })).toHaveValue('1');
    await page.keyboard.press('End');
  }
  await player.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(player.locator('.player-status')).toContainText('已暂停');
  expect((await readAudioProbe(page)).active).toBe(0);
  await player.getByRole('button', { name: '继续播放', exact: true }).click();
  await expect.poll(async () => (await readAudioProbe(page)).active).toBe(3);
  expect((await readAudioProbe(page)).decoded).toBe(3);
  await page.getByRole('navigation').getByRole('link', { name: '今晚', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '全局声音控制' })).toContainText('正在播放');
  expect((await readAudioProbe(page)).contexts).toBe(1);
  await page.getByRole('link', { name: '使用边界与隐私', exact: true }).click();
  await expect(page).toHaveURL(/\/about#boundaries$/);
  await page.getByRole('button', { name: '停止声音', exact: true }).click();
  await expect.poll(async () => (await readAudioProbe(page)).active).toBe(0);
  await expect(page.locator('.player-dock')).toHaveCount(0);
});

test('切换预设与保存恢复自定义混音，刷新不自动播放或恢复计时', async ({ page }) => {
  await page.goto('/relax');
  const player = page.locator('#ambient-player');
  await player.getByRole('button', { name: '播放混音', exact: true }).click();
  await expect(player.locator('.player-status')).toContainText('正在播放');
  for (const name of ['静谧海岸', '微风', '雨夜', '静谧海岸'])
    await player.getByRole('button', { name, exact: true }).click();
  await expect(player.locator('.player-status')).toContainText('正在播放');
  await expect.poll(async () => (await readAudioProbe(page)).active).toBe(2);
  await player.getByRole('switch', { name: '开启雨声' }).check();
  await player.getByRole('slider', { name: '雨声音量', exact: true }).focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await player.getByRole('textbox', { name: '自定义场景名称' }).fill('海风细雨');
  await player.getByRole('button', { name: '另存场景', exact: true }).click();
  await expect(player.getByText('场景已保存在当前浏览器。', { exact: true })).toBeVisible();
  await player.getByRole('combobox', { name: '停止时间' }).selectOption('20');
  await player.getByRole('button', { name: '应用定时', exact: true }).click();
  await page.reload();
  expect((await readAudioProbe(page)).contexts).toBe(0);
  await expect(player.locator('.player-status')).toContainText('尚未播放');
  await expect(player.locator('.timer-remaining')).toHaveText('不定时');
  await expect(player.getByRole('heading', { name: '海风细雨', exact: true })).toBeVisible();
  await expect(player.getByRole('slider', { name: '雨声音量', exact: true })).toHaveValue('1');
  await player.getByRole('button', { name: '微风', exact: true }).click();
  await player.getByRole('button', { name: '海风细雨', exact: true }).click();
  await expect(player.getByRole('switch', { name: '开启雨声' })).toBeChecked();
  await player.getByRole('button', { name: '删除场景 海风细雨' }).click();
  await expect(player.getByRole('button', { name: '海风细雨', exact: true })).toHaveCount(0);
});

test('定时暂停、取消和真实 6 秒渐弱停止有效', async ({ page }) => {
  await page.goto('/relax');
  const player = page.locator('#ambient-player');
  await player.getByRole('button', { name: '播放混音', exact: true }).click();
  await expect(player.locator('.player-status')).toContainText('正在播放');
  await player.getByRole('combobox', { name: '停止时间' }).selectOption('custom');
  await player.getByRole('spinbutton', { name: '自定义分钟' }).fill('0.1');
  await player.getByRole('combobox', { name: '结束前渐弱' }).selectOption('5');
  await player.getByRole('button', { name: '应用定时', exact: true }).click();
  await player.getByRole('button', { name: '暂停计时', exact: true }).click();
  await expect(player.locator('.timer-remaining')).toContainText('暂停计时');
  await player.getByRole('button', { name: '继续计时', exact: true }).click();
  await player.getByRole('button', { name: '取消定时', exact: true }).click();
  await expect(player.locator('.timer-remaining')).toHaveText('不定时');
  await expect.poll(async () => (await readAudioProbe(page)).rms).toBeGreaterThan(0.00001);
  await player.getByRole('button', { name: '应用定时', exact: true }).click();
  await expect(player.locator('.player-status')).toContainText('渐弱中', { timeout: 5000 });
  await expect(player.locator('.player-status')).toContainText('尚未播放', { timeout: 10000 });
  expect((await readAudioProbe(page)).active).toBe(0);
  await expect(player.getByText('定时已结束，声音已停止。', { exact: true })).toBeVisible();
});

test('加载和解码失败明确反馈，修复后可以重试', async ({ page }) => {
  await page.route('**/audio/rain.wav', (route) =>
    route.fulfill({ status: 200, contentType: 'audio/wav', body: Buffer.alloc(100) }),
  );
  await page.goto('/relax');
  const player = page.locator('#ambient-player');
  await player.getByRole('button', { name: '播放混音', exact: true }).click();
  await expect(player.getByRole('alert')).toContainText('播放未能启动');
  expect((await readAudioProbe(page)).active).toBe(0);
  await page.unroute('**/audio/rain.wav');
  await player.getByRole('button', { name: '重试播放', exact: true }).click();
  await expect.poll(async () => (await readAudioProbe(page)).rms).toBeGreaterThan(0.00001);
  await player.getByRole('button', { name: '停止', exact: true }).click();
});

test('浏览器拒绝权限不显示播放成功，重试可正常渲染', async ({ page }) => {
  await page.addInitScript(() => {
    const resume = AudioContext.prototype.resume;
    let denied = false;
    AudioContext.prototype.resume = function () {
      if (!denied) {
        denied = true;
        return Promise.reject(new DOMException('Blocked', 'NotAllowedError'));
      }
      return resume.call(this);
    };
  });
  await page.goto('/relax');
  const player = page.locator('#ambient-player');
  await player.getByRole('button', { name: '播放混音', exact: true }).click();
  await expect(player.getByRole('alert')).toContainText('播放未能启动');
  expect((await readAudioProbe(page)).active).toBe(0);
  await player.getByRole('button', { name: '重试播放', exact: true }).click();
  await expect.poll(async () => (await readAudioProbe(page)).rms).toBeGreaterThan(0.00001);
});

test('加载中停止与挂起/恢复不产生迟到播放', async ({ page }) => {
  await page.route('**/audio/*.wav', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue().catch(() => undefined);
  });
  await page.goto('/relax');
  const player = page.locator('#ambient-player');
  await player.getByRole('button', { name: '播放混音', exact: true }).click();
  await expect(player.locator('.player-status')).toContainText('正在准备');
  await player.getByRole('button', { name: '停止', exact: true }).click();
  await page.unrouteAll({ behavior: 'wait' });
  await expect(player.locator('.player-status')).toContainText('尚未播放');
  expect((await readAudioProbe(page)).active).toBe(0);
  await player.getByRole('button', { name: '播放混音', exact: true }).click();
  await expect(player.locator('.player-status')).toContainText('正在播放');
  await page.evaluate(() => window.__jhavenAudioProbe.contexts[0]!.suspend());
  await expect(player.locator('.player-status')).toContainText('已暂停');
  await page.evaluate(() => window.__jhavenAudioProbe.contexts[0]!.resume());
  await expect(player.locator('.player-status')).toContainText('已暂停');
  expect((await readAudioProbe(page)).active).toBe(0);
  await player.getByRole('button', { name: '继续播放', exact: true }).click();
  await expect.poll(async () => (await readAudioProbe(page)).rms).toBeGreaterThan(0.00001);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect
    .poll(() => page.evaluate(() => window.__jhavenAudioProbe.contexts[0]!.state))
    .toBe('closed');
});
