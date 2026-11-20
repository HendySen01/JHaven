import { expect, test } from '@playwright/test';
import { installAudioProbe, readAudioProbe } from './audio-probe.js';
import { randomBytes } from 'node:crypto';

test('访客练习支持键盘、暂停、跳过、静音和重新开始', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/relax');
  await page.getByLabel('此刻的状态').selectOption('noisy');
  await expect(page.getByText('建议试试身体觉察')).toBeVisible();
  await page.getByRole('button', { name: '跳过推荐' }).click();
  await expect(page.getByText('建议试试身体觉察')).toHaveCount(0);
  await page.getByRole('link', { name: '温和呼吸', exact: true }).click();
  await expect(page).toHaveURL('/practice/breathing');
  await page.getByRole('button', { name: '开始练习' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '选择舒服的姿势' })).toBeFocused();
  await expect(page.locator('.practice-page')).toHaveCSS('transition-duration', '0s');
  await expect(page.getByRole('combobox', { name: '声音场景' })).toHaveValue('');
  await page.getByRole('button', { name: '暂停练习' }).click();
  await expect(page.getByText(/第 1 \/ 3 步 · 已暂停/)).toBeVisible();
  await page.getByRole('button', { name: '继续练习' }).click();
  await page.getByRole('button', { name: '跳过此步' }).click();
  await expect(page.getByRole('heading', { name: '轻轻留意' })).toBeFocused();
  await page.getByRole('button', { name: '结束练习' }).click();
  await expect(page.getByRole('heading', { name: '练习已结束' })).toBeFocused();
  await expect(page.getByText('这次练习不会保存。下次想做，随时回来。')).toBeVisible();
  await page.getByRole('button', { name: '再练一次' }).click();
  await page.getByRole('button', { name: '开始练习' }).click();
  await expect(page.getByRole('heading', { name: '选择舒服的姿势' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
});

test('练习声音复用音频引擎，渐弱停止和离开练习后恢复混音', async ({ page }) => {
  await installAudioProbe(page);
  await page.goto('/practice/thoughts');
  await page.getByRole('button', { name: '开始练习' }).click();
  await page.getByRole('combobox', { name: '声音场景' }).selectOption('coast');
  await page.getByText('定时停止与渐弱', { exact: true }).click();
  await page.getByLabel('停止时间').selectOption('custom');
  await page.getByLabel('自定义分钟').fill('0.1');
  await page.getByLabel('结束前渐弱').selectOption('5');
  await page.getByRole('button', { name: '应用定时' }).click();
  await page.getByRole('button', { name: '播放练习声音' }).click();
  await expect.poll(async () => (await readAudioProbe(page)).rms).toBeGreaterThan(0.00001);
  expect(await readAudioProbe(page)).toMatchObject({ contexts: 1 });
  await expect(page.getByText('声音正在渐弱。')).toBeVisible();
  await expect.poll(async () => (await readAudioProbe(page)).active, { timeout: 10000 }).toBe(0);
  await page.getByRole('button', { name: '播放练习声音' }).click();
  await expect.poll(async () => (await readAudioProbe(page)).active).toBeGreaterThan(0);
  await page.getByRole('link', { name: '返回练习选择' }).click();
  await expect.poll(async () => (await readAudioProbe(page)).active).toBe(0);
  expect(await readAudioProbe(page)).toMatchObject({ contexts: 1 });
  await expect(page.locator('#ambient-player')).toContainText('雨夜');
});

test('从播放器进入练习不会停止既有混音，退出后仍在播放', async ({ page }) => {
  await installAudioProbe(page);
  await page.goto('/relax');
  await page.getByRole('button', { name: '播放混音', exact: true }).click();
  await expect.poll(async () => (await readAudioProbe(page)).active).toBeGreaterThan(0);
  await page.getByRole('link', { name: '思绪整理', exact: true }).click();
  await page.getByRole('button', { name: '开始练习' }).click();
  await expect(page.getByText(/现在的声音和计时会继续/)).toBeVisible();
  await page.getByRole('button', { name: '结束练习' }).click();
  await page.getByRole('link', { name: '返回练习选择' }).click();
  await expect(page.locator('#ambient-player .player-status')).toContainText('正在播放');
  expect(await readAudioProbe(page)).toMatchObject({ contexts: 1 });
});

test('本机语音暂停与继续、错误提示和声线消失后取消', async ({ page }) => {
  await page.addInitScript(() => {
    const synth = new EventTarget();
    Object.defineProperty(window, 'speechSynthesis', { value: synth });
    Object.defineProperty(synth, 'getVoices', {
      value: () => [
        { lang: 'zh-CN', localService: false, name: '远程' },
        ...(document.documentElement.dataset.speechLocal
          ? [{ lang: 'zh-CN', localService: true, name: '本机' }]
          : []),
      ],
    });
    Object.defineProperty(synth, 'speak', {
      value: (utterance: { text: string; onerror?: () => void }) => {
        document.documentElement.dataset.spoken = utterance.text;
        if (document.documentElement.dataset.speechFail) utterance.onerror?.();
      },
    });
    Object.defineProperty(synth, 'cancel', {
      value: () => {
        delete document.documentElement.dataset.spoken;
      },
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: class {
        constructor(readonly text: string) {}
      },
    });
  });
  await page.goto('/practice/unwind');
  await page.getByRole('button', { name: '开始练习' }).click();
  await page.getByText('显示与语音', { exact: true }).click();
  const voice = page.getByRole('checkbox', { name: '本机中文语音' });
  await expect(voice).toBeDisabled();
  await page.evaluate(() => {
    document.documentElement.dataset.speechLocal = 'true';
    window.speechSynthesis.dispatchEvent(new Event('voiceschanged'));
  });
  await expect(voice).not.toBeChecked();
  await voice.check();
  await expect(page.locator('html')).toHaveAttribute('data-spoken', /安顿下来/);
  await page.getByRole('button', { name: '暂停练习' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-spoken');
  await page.getByRole('button', { name: '继续练习' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-spoken', /安顿下来/);
  await page.evaluate(() => {
    delete document.documentElement.dataset.speechLocal;
    window.speechSynthesis.dispatchEvent(new Event('voiceschanged'));
  });
  await expect(voice).toBeDisabled();
  await expect(voice).not.toBeChecked();
  await expect(page.locator('html')).not.toHaveAttribute('data-spoken');
  await page.evaluate(() => {
    document.documentElement.dataset.speechLocal = 'true';
    document.documentElement.dataset.speechFail = 'true';
    window.speechSynthesis.dispatchEvent(new Event('voiceschanged'));
  });
  await voice.check();
  await expect(page.getByText('本机语音未能播放，你仍可阅读引导。')).toBeVisible();
});

test('账户练习需主动保存，并可在账户页删除', async ({ page }) => {
  test.skip(process.env.JHAVEN_TEST_MYSQL !== '1', '需要隔离 MySQL。');
  expect(process.env.DB_NAME).toMatch(/^jhaven_test_/);
  const username = 'practice_' + randomBytes(7).toString('hex');
  const password = '隔离账户测试的临时示范口令 58';
  await page.goto('/register');
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByLabel('确认密码').fill(password);
  await page.locator('form').getByRole('button', { name: '注册', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.locator('form').getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL('/account');
  await expect(page.getByText('还没有保存的练习。')).toBeVisible();
  await page.getByLabel('默认场景').selectOption('coast');
  await page.getByRole('button', { name: '保存默认设置' }).click();
  await expect(page.getByText('默认播放设置已保存。')).toBeVisible();
  await page.getByRole('link', { name: '打开声音库' }).click();
  await page.getByLabel('此刻的状态').selectOption('busy');
  await expect(page.getByText(/你保存的声音场景 · .*海岸/)).toBeVisible();
  await page.getByRole('link', { name: '打开推荐练习' }).click();
  let posts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/space/relaxation')) posts++;
  });
  await page.getByRole('button', { name: '开始练习' }).click();
  await expect(page.getByText('第 1 / 3 步 · 19 秒')).toBeVisible();
  await page.getByRole('button', { name: '结束练习' }).click();
  expect(posts).toBe(0);
  await page.getByRole('button', { name: '保存这次练习' }).click();
  await expect(page.getByText('练习已保存。')).toBeVisible();
  expect(posts).toBe(1);
  await page.getByRole('link', { name: '查看练习记录' }).click();
  const history = page.getByRole('region', { name: '放松练习记录' });
  await expect(history).toContainText('思绪整理');
  await expect(history).toContainText('提前结束');
  page.once('dialog', (dialog) => void dialog.accept());
  await history.getByRole('button', { name: '删除记录' }).click();
  await expect(history).toContainText('还没有保存的练习。');
});
