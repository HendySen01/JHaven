import { expect, test } from '@playwright/test';
import { installAudioProbe, readAudioProbe } from './audio-probe.js';

test('实录替换保留旧名搜索、收藏与音量', async ({ page }) => {
  await installAudioProbe(page);
  await page.goto('/relax/rain');
  const search = page.getByRole('searchbox', { name: '搜索声音' });
  await search.fill('柔和颗粒声');
  const volume = page.getByRole('slider', { name: '轻柔咀嚼拟音音量' });
  await volume.fill('55');
  await page.getByRole('button', { name: '收藏轻柔咀嚼拟音' }).click();
  await page.reload();
  await search.fill('咀嚼声');
  await page.getByLabel('声音分类').selectOption('favorites');
  await expect(volume).toHaveValue('55');
  await expect(page.getByText('轻柔咀嚼拟音', { exact: true })).toBeVisible();
  await page.getByLabel('声音分类').selectOption('all');
  await search.fill('Crispy Squishy');
  await expect(page.getByText('轻脆碎响（合成）', { exact: true })).toBeVisible();
  await search.fill('风扇');
  const request = page.waitForRequest('**/audio/fan.wav');
  await page.getByRole('button', { name: '试听柔和风扇声' }).click();
  await request;
  await expect(page.getByRole('button', { name: '停止试听柔和风扇声' })).toBeVisible();
  await expect.poll(async () => (await readAudioProbe(page)).rms).toBeGreaterThan(0);
});

test('风扇试听从中档就有信号，分档音量和混音设置保持独立', async ({ page }) => {
  await page.goto('/relax/rain');
  const player = page.locator('#ambient-player');
  const fan = player.getByRole('slider', { name: '柔和风扇声音量' });
  await player.getByRole('slider', { name: '总音量' }).fill('45');
  await fan.fill('50');
  await player.getByRole('button', { name: '试听柔和风扇声' }).click();
  const rms = async () => (await readAudioProbe(page)).rms;
  await expect.poll(rms).toBeGreaterThan(0.00065);
  const middle = await rms();
  await fan.fill('75');
  await expect.poll(rms).toBeGreaterThan(middle * 1.65);
  const upper = await rms();
  await fan.fill('100');
  await expect.poll(rms).toBeGreaterThan(upper * 1.35);
  await fan.fill('50');
  await player.getByRole('button', { name: '停止试听柔和风扇声' }).click();
  await expect.poll(async () => (await readAudioProbe(page)).active).toBe(0);
  await player.getByRole('switch', { name: '开启柔和风扇声' }).check();
  await player.getByRole('button', { name: '播放混音', exact: true }).click();
  await expect.poll(async () => (await readAudioProbe(page)).active).toBeGreaterThan(1);
  await expect(fan).toHaveValue('50');
  await expect(player.getByRole('slider', { name: '总音量' })).toHaveValue('45');
});

test('场景按钮播放手调混音，暂停图标与音量跨页保持一致', async ({ page }) => {
  await installAudioProbe(page);
  await page.goto('/relax/rain');
  const section = page.locator('.detail-copy');
  await section.getByRole('button', { name: '播放此场景', exact: true }).click();
  await expect(section.getByRole('button', { name: '暂停此场景' }).locator('svg')).toHaveClass(
    /lucide-pause/,
  );
  await page.locator('.player-buttons').getByRole('button', { name: '停止' }).click();
  const chew = page.getByRole('slider', { name: '轻柔咀嚼拟音音量' });
  const crinkle = page.getByRole('slider', { name: '轻脆碎响（合成）音量' });
  await chew.fill('55');
  await crinkle.fill('40');
  await page.getByRole('switch', { name: '开启轻柔咀嚼拟音' }).check();
  await page.getByRole('switch', { name: '开启轻脆碎响（合成）' }).check();
  await section.getByRole('button', { name: '播放当前混音' }).click();
  const pause = section.getByRole('button', { name: '暂停当前混音' });
  await expect(pause.locator('svg')).toHaveClass(/lucide-pause/);
  await expect(chew).toHaveValue('55');
  await expect(crinkle).toHaveValue('40');
  await pause.click();
  await section.getByRole('button', { name: '继续播放' }).click();
  await expect(pause).toBeVisible();
  await page.getByRole('link', { name: '睡前助手', exact: true }).click();
  await expect(page.getByRole('button', { name: '暂停声音' })).toBeVisible();
  await page.getByRole('button', { name: '停止声音' }).click();
  await page.goto('/relax/rain');
  await expect(chew).toHaveValue('55');
  await page.getByRole('switch', { name: '开启轻柔咀嚼拟音' }).uncheck();
  await page.getByRole('button', { name: '试听轻柔咀嚼拟音', exact: true }).click();
  await expect(page.getByRole('switch', { name: '开启轻柔咀嚼拟音' })).not.toBeChecked();
  await expect(chew).toHaveValue('55');
  await expect(
    page.getByRole('button', { name: '停止试听轻柔咀嚼拟音' }).locator('svg'),
  ).toHaveClass(/lucide-square/);
});

test('没有 Web Audio 时解释播放失败，仍可访问声音库', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioContext', { value: undefined });
  });
  await page.goto('/relax');
  const player = page.locator('#ambient-player');
  await player.getByRole('button', { name: '播放混音', exact: true }).click();
  await expect(player.getByRole('alert')).toContainText('当前浏览器无法创建音频');
  await expect(player.getByRole('button', { name: '重试', exact: false })).toBeVisible();
});

test.beforeEach(async ({ page }) => {
  await installAudioProbe(page);
});

test('默认总音量下雨声输出不再被整个目录过度衰减', async ({ page }) => {
  await page.goto('/relax');
  const player = page.locator('#ambient-player');
  await player.getByRole('switch', { name: '开启微风', exact: true }).uncheck();
  await expect(player.getByRole('slider', { name: '总音量' })).toHaveValue('45');
  await expect(player.getByRole('slider', { name: '雨声音量', exact: true })).toHaveValue('65');
  await player.getByRole('button', { name: '播放混音', exact: true }).click();
  await expect(player.locator('.player-status')).toContainText('正在播放');
  await expect.poll(async () => (await readAudioProbe(page)).rms).toBeGreaterThan(0.0015);
  expect((await readAudioProbe(page)).active).toBe(1);
  await player.getByRole('button', { name: '静音', exact: true }).click();
  await expect.poll(async () => (await readAudioProbe(page)).rms).toBe(0);
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
  await player.getByRole('link', { name: '关于这些声音' }).click();
  await expect(page.getByRole('heading', { name: '声音用途与研究依据' })).toBeVisible();
});

test('当前目录的所有 WAV 在同一原生音频图解码和混合', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/relax');
  const player = page.locator('#ambient-player');
  const count = 19;
  const tracks = player.getByRole('switch');
  await expect(tracks).toHaveCount(count);
  const switches = await tracks.all();
  for (const track of switches) await track.check();
  await player.getByRole('button', { name: '播放混音', exact: true }).click();
  await expect(player.locator('.player-status')).toContainText('正在播放');
  await expect.poll(async () => (await readAudioProbe(page)).rms).toBeGreaterThan(0.00001);
  expect(await readAudioProbe(page)).toMatchObject({ contexts: 1, active: count, decoded: count });
  expect(
    await page.evaluate(() =>
      [...window.__jhavenAudioProbe.voices].every(
        (voice) =>
          voice.loop && voice.buffer!.getChannelData(0).some((sample) => Math.abs(sample) > 0.001),
      ),
    ),
  ).toBe(true);
  await player.getByRole('button', { name: '暂停', exact: true }).click();
  await expect.poll(async () => (await readAudioProbe(page)).active).toBe(0);
  await player.getByRole('button', { name: '继续播放', exact: true }).click();
  await expect.poll(async () => (await readAudioProbe(page)).active).toBe(count);
  expect(await readAudioProbe(page)).toMatchObject({ contexts: 1, decoded: count });
  await player.getByRole('button', { name: '停止', exact: true }).click();
  await expect.poll(async () => (await readAudioProbe(page)).active).toBe(0);
});

test('七条公开实录在生产预览可搜、可试听并保留收藏与音量', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/relax');
  const search = page.getByRole('searchbox', { name: '搜索声音' });
  await page.getByLabel('声音分类').selectOption('texture');
  const tracks = [
    ['酥脆咀嚼声', 'crunchy-chew'],
    ['轻柔口腔 ASMR', 'mouth-asmr'],
    ['清脆积木翻动', 'lego-rustle'],
    ['落叶脚步声', 'leaf-steps'],
    ['脆皮捏捏', 'crispy-squishy'],
    ['牛排骨-牛肉拌饭吞咽声', 'beef-rice-swallow'],
    ['火鸡面吞咽声', 'spicy-noodle-swallow'],
  ];
  for (const [name, id] of tracks) {
    await search.fill(name!);
    const loaded = page.waitForResponse(`**/audio/${id}.wav`);
    await page.getByRole('button', { name: '试听' + name, exact: true }).click();
    const asset = await loaded;
    expect(asset.status()).toBe(200);
    expect(asset.headers()['content-type']).toMatch(/audio/);
    await expect.poll(async () => (await readAudioProbe(page)).active).toBe(1);
    await page.getByRole('button', { name: '停止试听' + name }).click();
    await expect.poll(async () => (await readAudioProbe(page)).active).toBe(0);
  }
  await search.fill('脆皮捏捏');
  const crispy = page.getByRole('slider', { name: '脆皮捏捏音量' });
  await crispy.fill('37');
  await page.getByRole('button', { name: '收藏脆皮捏捏' }).click();
  await search.fill('落叶脚步声');
  const leaf = page.getByRole('slider', { name: '落叶脚步声音量' });
  await leaf.fill('57');
  await page.getByRole('button', { name: '收藏落叶脚步声' }).click();
  await page.reload();
  await expect(search).toHaveValue('落叶脚步声');
  await search.fill('');
  await page.getByLabel('声音分类').selectOption('favorites');
  await expect(leaf).toHaveValue('57');
  await expect(crispy).toHaveValue('37');
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
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'jhaven.audio.v1') throw new DOMException('Blocked', 'SecurityError');
      return set.call(this, key, value);
    };
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

test('刷新保留普通混音会话，需主动恢复，停止后不再提示', async ({ page }) => {
  await page.goto('/relax');
  const player = page.locator('#ambient-player');
  await player.getByRole('slider', { name: '总音量' }).fill('37');
  await player.getByRole('button', { name: '播放混音', exact: true }).click();
  await expect(player.locator('.player-status')).toContainText('正在播放');
  await player.getByRole('combobox', { name: '停止时间' }).selectOption('20');
  await player.getByRole('button', { name: '应用定时', exact: true }).click();
  await page.reload();
  expect((await readAudioProbe(page)).contexts).toBe(0);
  await expect(player.getByRole('button', { name: '继续上次播放' })).toBeVisible();
  await player.getByRole('button', { name: '继续上次播放' }).click();
  await expect(player.locator('.player-status')).toContainText('正在播放');
  await expect(player.locator('.timer-remaining')).toContainText('剩余');
  await expect(player.getByRole('slider', { name: '总音量' })).toHaveValue('37');
  await player.getByRole('button', { name: '停止', exact: true }).click();
  await expect(player.locator('.player-status')).toContainText('尚未播放');
  await page.reload();
  await expect(player.getByRole('button', { name: '继续上次播放' })).toHaveCount(0);
});

test('恢复前已经到期的会话不提示播放', async ({ page }) => {
  await page.goto('/relax');
  const player = page.locator('#ambient-player');
  await player.getByRole('button', { name: '播放混音', exact: true }).click();
  await expect(player.locator('.player-status')).toContainText('正在播放');
  await player.getByRole('combobox', { name: '停止时间' }).selectOption('20');
  await player.getByRole('button', { name: '应用定时', exact: true }).click();
  await page.evaluate(() => {
    const key = 'jhaven.audio.session.v1';
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error('没有保存播放会话');
    const saved = JSON.parse(raw);
    saved.savedAt = Date.now() - 1200001;
    saved.deadline = Date.now() - 1;
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload();
  expect((await readAudioProbe(page)).contexts).toBe(0);
  await expect(player.getByRole('button', { name: '继续上次播放' })).toHaveCount(0);
});
