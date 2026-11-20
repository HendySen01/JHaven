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
  await page.getByLabel('今晚想聊什么').fill('白噪声有助睡眠吗？');
  await page.getByRole('button', { name: '发送' }).focus();
  await page.keyboard.press('Enter');
  await page.getByText('查看来源与证据').click();
  await expect(page.getByRole('link', { name: /Capezuti/ })).toHaveAttribute(
    'href',
    'https://pmc.ncbi.nlm.nih.gov/articles/PMC9163611/',
  );
  await page.getByLabel('今晚想聊什么').fill('想听雨声');
  await page.getByRole('button', { name: '发送' }).click();
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
    const { mode } = route.request().postDataJSON() as { mode: string };
    choices.push(mode === 'ai');
    if (mode === 'local') return route.continue();
    return route.fulfill({
      status: 429,
      headers: { 'Retry-After': '30' },
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
  await expect(page.getByText('JHaven 的 AI 用量已达到今日上限，可以改用本地知识。')).toBeVisible();
  await expect(page.getByRole('button', { name: '重试回复' })).toBeDisabled();
  await expect(page.getByText('请求未完成', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '改用本地知识' }).click();
  await expect(page.getByRole('button', { name: '推荐 · 思绪整理' })).toBeVisible();
  await expect(consent).not.toBeChecked();
  await expect(page.getByText('本地知识模式')).toBeVisible();
  expect(choices).toEqual([false, true, false]);
});

test('发送只产生一个 AI 请求，等待期间改为本地会忽略迟到回复', async ({ page }) => {
  await page.route('**/api/assistant/status', (route) =>
    route.fulfill({ json: { provider: 'deepseek', knowledgeVersion: 'fixture' } }),
  );
  const modes: string[] = [];
  let finish = () => {};
  await page.route('**/api/assistant/chat', async (route) => {
    const { mode } = route.request().postDataJSON() as { mode: string };
    modes.push(mode);
    if (mode === 'local') return route.continue();
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    await route
      .fulfill({
        contentType: 'application/x-ndjson',
        body:
          [
            { type: 'start', mode: 'model' },
            { type: 'text', text: '迟到的模型答复' },
            { type: 'done', sources: [], actions: [] },
          ]
            .map((event) => JSON.stringify(event))
            .join('\n') + '\n',
      })
      .catch(() => undefined);
  });
  await page.goto('/assistant');
  const consent = page.getByRole('checkbox', { name: /DeepSeek/ });
  await consent.check();
  await page.getByLabel('今晚想聊什么').fill('有呀有呀');
  await page.locator('form').evaluate((form) => {
    (form as HTMLFormElement).requestSubmit();
    (form as HTMLFormElement).requestSubmit();
  });
  await expect.poll(() => modes).toEqual(['ai']);
  await page.getByRole('button', { name: '改用本地知识' }).click();
  await expect(consent).not.toBeChecked();
  await expect(page.locator('.assistant-reply-mode')).toHaveText('本地知识');
  finish();
  await expect(page.getByText('迟到的模型答复')).toHaveCount(0);
  await page.getByLabel('今晚想聊什么').fill('呃呃呃');
  await page.getByRole('button', { name: '发送' }).click();
  await expect.poll(() => modes).toEqual(['ai', 'local', 'local']);
});

test('明确同意后只带紧邻的已完成 AI 对话，知识问答可显示来源', async ({ page }) => {
  const questions = [
    '今天被骂了',
    '我自己能缓就不找你聊天了',
    '呃呃呃',
    '我就是想找你聊聊天',
    '浓茶会影响睡眠吗',
  ];
  const replies = [
    '这事是怎么发生的？',
    '我刚才抢着给建议了。你接着说，我在听。',
    '嗯。',
    '好，就随便聊聊。',
    '浓茶中的咖啡因可能影响入睡。',
  ];
  const incoming: { mode: string; previousReply?: string; messages: string[] }[] = [];
  await page.route('**/api/assistant/status', (route) =>
    route.fulfill({ json: { provider: 'deepseek', knowledgeVersion: 'fixture' } }),
  );
  await page.route('**/api/assistant/chat', async (route) => {
    incoming.push(route.request().postDataJSON());
    const text = replies[incoming.length - 1];
    const sources =
      incoming.length === questions.length
        ? [
            {
              id: 'caffeine',
              title: 'NHLBI 睡眠习惯',
              url: 'https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits',
              published: '2022-03-24',
              population: '成人',
              evidence: '一般健康建议',
              limits: '个体敏感度不同',
              summary: '咖啡因可能影响入睡',
            },
          ]
        : [];
    await route.fulfill({
      contentType: 'application/x-ndjson',
      body:
        [
          { type: 'start', mode: 'model' },
          { type: 'text', text },
          { type: 'done', sources, actions: [] },
        ]
          .map((event) => JSON.stringify(event))
          .join('\n') + '\n',
    });
  });
  await page.goto('/assistant');
  await page.getByRole('checkbox', { name: /同意.*DeepSeek/ }).check();
  for (const [index, question] of questions.entries()) {
    await page.getByLabel('今晚想聊什么').fill(question);
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.locator('.assistant-turn').last().locator('.assistant-text')).toHaveText(
      replies[index]!,
    );
    await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0);
    expect(incoming[index]?.previousReply).toBe(replies[index - 1]);
    expect(incoming[index]?.messages.at(-1)).toBe(question);
  }
  expect(incoming).toHaveLength(5);
  await expect(page.getByRole('button', { name: /^推荐 ·/ })).toHaveCount(0);
  await page.getByText('查看来源与证据', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'NHLBI 睡眠习惯' })).toBeVisible();
});
