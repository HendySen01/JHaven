import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { installAudioProbe, readAudioProbe } from './audio-probe.js';

test('有来源的 AI 回答保留推荐理由与确认步骤', async ({ page }) => {
  await page.route('**/api/assistant/status', (route) =>
    route.fulfill({ json: { provider: 'deepseek', knowledgeVersion: '2026-11-18.1' } }),
  );
  await page.route('**/api/assistant/chat', (route) =>
    route.fulfill({
      contentType: 'application/x-ndjson',
      body:
        [
          { type: 'start', mode: 'model' },
          { type: 'text', text: '你可以先留意自己的感受。白噪声改善睡眠的证据不明确。' },
          {
            type: 'done',
            sources: [
              {
                id: 'auditory-review',
                title: '审核来源',
                url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9163611/',
                published: '2022-06-01',
                population: '成人',
                evidence: '系统综述',
                limits: '结果不确定',
                summary: '改善睡眠的证据不明确',
              },
            ],
            actions: [{ kind: 'scene', id: 'rain', mood: 'noisy' }],
            reason: '先低音量试听',
          },
        ]
          .map((event) => JSON.stringify(event))
          .join('\n') + '\n',
    }),
  );
  await page.goto('/assistant');
  await page.getByRole('checkbox', { name: /DeepSeek/ }).check();
  await page.getByRole('button', { name: '白噪声有助睡眠吗？' }).click();
  await expect(page.getByText('AI 辅助回答')).toBeVisible();
  await expect(page.getByText('先低音量试听')).toBeVisible();
  await page.getByText('查看来源与证据').click();
  await expect(page.getByRole('link', { name: '审核来源' })).toHaveAttribute(
    'href',
    'https://pmc.ncbi.nlm.nih.gov/articles/PMC9163611/',
  );
  await page.getByRole('button', { name: '推荐 · 雨夜' }).click();
  await expect(page).toHaveURL('/assistant');
  await expect(page.getByRole('button', { name: '确认前往' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '确认前往' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '推荐 · 雨夜' })).toBeFocused();
});

test.beforeEach(async ({ page }, info) => {
  // 三个视口共用本地代理，用文档保留地址为每个测试模拟独立访客。
  const address = createHash('sha256')
    .update(info.testId + ':' + info.retry)
    .digest('hex');
  await page.setExtraHTTPHeaders({
    'X-Forwarded-For': '2001:db8::' + address.slice(0, 4) + ':' + address.slice(4, 8),
  });
});

test('本地知识显示来源，站内操作需确认且无自动播放', async ({ page }) => {
  await installAudioProbe(page, false);
  await page.goto('/');
  await page.getByRole('link', { name: '睡前助手' }).click();
  await expect(page.getByRole('heading', { name: '睡前助手' })).toBeVisible();
  await expect(page.getByText('当前可用审核知识和站内推荐，模型服务未启用。')).toBeVisible();
  await page.getByLabel('今晚想聊什么').fill('想听雨声');
  await page.getByRole('button', { name: '发送' }).focus();
  await page.keyboard.press('Enter');
  await page.getByText('查看来源与证据').click();
  await expect(page.getByRole('link', { name: /Capezuti/ })).toHaveAttribute(
    'href',
    'https://pmc.ncbi.nlm.nih.gov/articles/PMC9163611/',
  );
  await page.getByRole('button', { name: '推荐 · 雨夜' }).click();
  await expect(page).toHaveURL('/assistant');
  await expect(page.getByRole('button', { name: '确认前往' })).toBeFocused();
  expect(await readAudioProbe(page)).toMatchObject({ contexts: 0 });
  await page.getByRole('button', { name: '确认前往' }).click();
  await expect(page).toHaveURL('/relax/rain');
  expect(await readAudioProbe(page)).toMatchObject({ contexts: 0 });
});
test('停止、重试和重新生成，离开后清空会话', async ({ page }) => {
  let calls = 0;
  let release: () => void = () => {};
  await page.route('**/api/assistant/chat', async (route) => {
    if (++calls === 1) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.abort().catch(() => undefined);
    } else await route.continue();
  });
  await page.goto('/assistant');
  await page.getByRole('button', { name: '思绪停不下来' }).click();
  await expect.poll(() => calls).toBe(1);
  await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible();
  await page.getByRole('button', { name: '停止生成' }).focus();
  await page.keyboard.press('Enter');
  release();
  await expect(page.getByText('已停止生成。')).toBeVisible();
  await expect(page.getByLabel('今晚想聊什么')).toBeFocused();
  await page.getByLabel('今晚想聊什么').fill('尚未发送的新问题');
  await page.getByRole('button', { name: '重试回复' }).click();
  await expect(page.getByRole('button', { name: '推荐 · 思绪整理' })).toBeVisible();
  await expect(page.getByLabel('今晚想聊什么')).toHaveValue('尚未发送的新问题');
  await page.getByRole('button', { name: '重新生成' }).click();
  await expect(page.getByRole('button', { name: '推荐 · 思绪整理' })).toBeVisible();
  await page.getByRole('link', { name: '关于', exact: true }).click();
  await page.getByRole('link', { name: '睡前助手' }).click();
  await expect(page.getByRole('button', { name: '思绪停不下来' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
});

test('模型需逐页同意，限流后可以改用本地知识', async ({ page }) => {
  await page.route('**/api/assistant/status', (route) =>
    route.fulfill({
      json: { provider: 'openai', knowledgeVersion: 'fixture' },
    }),
  );
  const choices: boolean[] = [];
  await page.route('**/api/assistant/chat', (route) => {
    const { useModel } = route.request().postDataJSON() as { useModel: boolean };
    choices.push(useModel);
    if (!useModel) return route.continue();
    return route.fulfill({
      status: 429,
      json: { error: { code: 'MODEL_LIMIT' } },
    });
  });
  await page.goto('/assistant');
  const consent = page.getByRole('checkbox', { name: /OpenAI/ });
  await expect(consent).not.toBeChecked();
  await page.getByRole('button', { name: '思绪停不下来' }).click();
  await expect(page.getByRole('button', { name: '推荐 · 思绪整理' })).toBeVisible();
  await consent.check();
  await page.getByRole('button', { name: '重新生成' }).click();
  await expect(page.getByText('模型额度暂不可用，可以改用本地知识。')).toBeVisible();
  await page.getByRole('button', { name: '改用本地知识' }).click();
  await expect(page.getByRole('button', { name: '推荐 · 思绪整理' })).toBeVisible();
  expect(choices).toEqual([false, true, false]);
});
