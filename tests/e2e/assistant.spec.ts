import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { installAudioProbe, readAudioProbe } from './audio-probe.js';
import { removeUnsupportedSafariApis } from './safari-api-probe.js';

test('有来源的 AI 回答保留推荐理由与确认步骤', async ({ page }) => {
  await removeUnsupportedSafariApis(page);
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
  await expect(page.getByText('回复来源', { exact: true })).toHaveCount(0);
  await expect(page.getByText('先低音量试听')).toBeVisible();
  await page.getByText('参考资料').click();
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

test('切到新供应商须重新授权，历史回复不会跟过去', async ({ page }) => {
  await page.route('**/api/assistant/status', (route) =>
    route.fulfill({
      json: {
        provider: 'deepseek',
        providers: [
          { id: 'deepseek', model: 'deepseek-flash' },
          { id: 'openai', model: 'gpt-4.1-mini' },
        ],
        knowledgeVersion: 'fixture',
      },
    }),
  );
  const sent: Record<string, unknown>[] = [];
  await page.route('**/api/assistant/chat', (route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    if (body.mode === 'local') return route.continue();
    return route.fulfill({
      contentType: 'application/x-ndjson',
      body:
        [
          { type: 'start', mode: 'model' },
          { type: 'text', text: '今晚的风带了点凉意。' },
          { type: 'done', sources: [], actions: [] },
        ]
          .map((frame) => JSON.stringify(frame))
          .join('\n') + '\n',
    });
  });
  await page.goto('/assistant');
  const submit = async (text: string) => {
    const field = page.getByLabel('今晚想聊什么');
    await field.fill(text);
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(field).toHaveValue('');
  };
  await page.getByRole('checkbox', { name: /DeepSeek/ }).check();
  await submit('今晚风有点大');
  await expect(page.getByText('DeepSeek', { exact: true })).toBeVisible();
  await expect(page.getByText('参考资料', { exact: true })).toHaveCount(0);
  await expect(page.getByText('回复来源', { exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'AI 供应商' }).selectOption('openai');
  const consent = page.getByRole('checkbox', { name: /OpenAI/ });
  await expect(consent).not.toBeChecked();
  await submit('你好');
  expect(sent[1]).not.toHaveProperty('provider');
  await consent.check();
  await submit('换个话题');
  expect(sent[2]).toMatchObject({
    mode: 'ai',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    messages: ['换个话题'],
  });
  expect(sent[2]).not.toHaveProperty('previousReply');
  expect(sent[2]).not.toHaveProperty('earlierReply');
});

test('本地知识显示来源，站内操作需确认且无自动播放', async ({ page }) => {
  await removeUnsupportedSafariApis(page);
  await installAudioProbe(page, false);
  await page.goto('/');
  await page.getByRole('link', { name: '睡前助手' }).click();
  await expect(page.getByRole('heading', { name: '睡前助手' })).toBeVisible();
  await expect(page.getByText('当前可用审核知识和站内推荐，模型服务未启用。')).toBeVisible();
  await page.getByLabel('今晚想聊什么').fill('白噪声有助睡眠吗？');
  await page.getByRole('button', { name: '发送' }).focus();
  await page.keyboard.press('Enter');
  await page.getByText('参考资料').click();
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
test('停止、重试、重新生成及站内返回保留会话与草稿，刷新后清除', async ({ page }) => {
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
  await expect(page.getByText('思绪停不下来', { exact: true })).toBeVisible();
  await expect(page.getByLabel('今晚想聊什么')).toHaveValue('尚未发送的新问题');
  await page.reload();
  await expect(page.getByRole('button', { name: '思绪停不下来' })).toBeVisible();
  await expect(page.getByLabel('今晚想聊什么')).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
});

test('40 轮完整可读，保留聊天偏好且原文上下文仍受限', async ({ page }) => {
  const sent: {
    messages: string[];
    prefersChat?: boolean;
    earlierReply?: string;
    olderHistory?: { user: string; sentOn: string }[];
    latestSentOn?: string;
  }[] = [];
  await page.exposeFunction('captureChat', (body: (typeof sent)[number]) => sent.push(body));
  await page.route('**/api/assistant/status', (route) =>
    route.fulfill({
      json: {
        provider: 'deepseek',
        providers: [{ id: 'deepseek', model: 'deepseek-flash' }],
        knowledgeVersion: 'fixture',
      },
    }),
  );
  await page.addInitScript(() => {
    const capture = (window as Window & { captureChat?: (body: unknown) => Promise<number> })
      .captureChat;
    if (!capture) throw new Error('缺少聊天测试记录器');
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (input !== '/api/assistant/chat') return original(input, init);
      const body = JSON.parse(String(init?.body)) as { messages: string[] };
      await capture(body);
      const current = body.messages.at(-1)!;
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(stream) {
            const emit = (event: object) =>
              stream.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
            const finish = () => {
              emit({ type: 'text', text: '回声 ' + current + '。'.repeat(95) });
              emit({ type: 'done', sources: [], actions: [] });
              stream.close();
            };
            emit({ type: 'start', mode: 'model' });
            if (current === '慢一点再答') {
              emit({ type: 'text', text: '正在等下一段' });
              window.addEventListener('continue-chat-test', finish, { once: true });
            } else finish();
          },
        }),
        { headers: { 'Content-Type': 'application/x-ndjson' } },
      );
    };
  });
  await page.goto('/assistant');
  const consent = page.getByRole('checkbox', { name: '使用 DeepSeek 聊天' });
  await expect(consent).not.toBeChecked();
  await expect(page.getByText(/本次消息和最多六轮.*发送日期.*日记不会自动发送/)).toBeVisible();
  await consent.check();
  const draft = page.getByLabel('今晚想聊什么');
  const submit = async (question: string) => {
    await draft.fill(question);
    await page.getByRole('button', { name: '发送', exact: true }).click();
  };
  for (let n = 1; n <= 40; n++) {
    await submit(
      n === 2
        ? '我只是想和你闲聊，不用给我建议'
        : n === 31
          ? '为展示准备了一个星期'
          : n === 40
            ? '我之前说为展示准备了多久？'
            : `话题 ${n}`,
    );
    await expect(draft).toHaveValue('');
  }
  const region = page.getByRole('region', { name: '完整对话' });
  const gap = () =>
    region.evaluate((pane) => pane.scrollHeight - pane.clientHeight - pane.scrollTop);
  await expect(region.locator('.assistant-turn')).toHaveCount(40);
  await expect.poll(gap).toBeLessThan(3);
  expect(sent[0]?.messages).toEqual(['话题 1']);
  expect(sent[39]?.messages).toEqual(['话题 38', '话题 39', '我之前说为展示准备了多久？']);
  expect(sent[39]?.earlierReply).toContain('话题 38');
  expect(sent[39]?.olderHistory?.map(({ user }) => user)).toEqual([
    '为展示准备了一个星期',
    '话题 36',
    '话题 37',
  ]);
  expect(sent[39]?.olderHistory?.[0]?.sentOn).toBe(sent[39]?.latestSentOn);
  expect(sent[39]?.prefersChat).toBe(true);
  expect(JSON.stringify(sent[39])).not.toContain('不用给我建议');
  await submit('慢一点再答');
  await expect(page.getByText('正在等下一段')).toBeVisible();
  await region.evaluate((pane) => {
    pane.scrollTop = 0;
  });
  const latest = page.getByRole('button', { name: '回到底部' });
  await expect(latest).toBeVisible();
  await draft.fill('下一条草稿');
  await page.evaluate(() => window.dispatchEvent(new Event('continue-chat-test')));
  await expect(page.getByRole('button', { name: '重新生成' })).toBeVisible();
  expect(await region.evaluate((pane) => pane.scrollTop)).toBe(0);
  await region.scrollIntoViewIfNeeded();
  await expect(region.getByText('话题 1', { exact: true })).toBeInViewport();
  await expect(draft).toHaveValue('下一条草稿');
  await latest.click();
  await expect.poll(gap).toBeLessThan(3);
  await expect(region.locator('.assistant-turn')).toHaveCount(41);
});

test('桌面 Enter、触屏换行、中文组合键与请求失败时的草稿', async ({ page }) => {
  const messages: string[] = [];
  await page.route('**/api/assistant/chat', async (route) => {
    messages.push(route.request().postDataJSON().messages.at(-1));
    if (messages.length === 1) await route.abort('failed');
    else await route.continue();
  });
  await page.goto('/assistant');
  const composer = page.getByLabel('今晚想聊什么');
  const send = page.getByRole('button', { name: '发送', exact: true });
  await composer.fill('   ');
  await expect(send).toBeDisabled();
  await composer.fill('今天想聊聊');
  await composer.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(2, 2));
  await composer.press('Shift+Enter');
  await expect(composer).toHaveValue('今天\n想聊聊');
  await composer.evaluate((element) => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }),
    );
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(messages).toEqual([]);
  const desktop = await page.evaluate(
    () => matchMedia('(hover: hover) and (pointer: fine)').matches,
  );
  // 真实按键在候选确认后单独触发。
  await composer.evaluate(() => new Promise((resolve) => setTimeout(resolve, 60)));
  await expect(send).toBeEnabled();
  if (!desktop) {
    await composer.evaluate((element) => {
      const input = element as HTMLTextAreaElement;
      input.setSelectionRange(input.value.length, input.value.length);
    });
    await composer.press('Enter');
    await expect(composer).toHaveValue('今天\n想聊聊\n');
    expect(messages).toEqual([]);
    await send.click();
  } else {
    await composer.press('Enter');
  }
  await expect(page.getByText('网络连接中断，可以重试。')).toBeVisible();
  await expect(composer).toHaveValue(desktop ? '今天\n想聊聊' : '今天\n想聊聊\n');
  if (desktop) await expect(composer).toBeFocused();
  if (desktop) await composer.press('Enter');
  else await send.click();
  await expect(page.getByText('本地知识', { exact: true })).toBeVisible();
  await expect(composer).toHaveValue('');
  expect(messages).toEqual(['今天\n想聊聊', '今天\n想聊聊']);
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
      json: { error: { code: 'ASSISTANT_LIMIT' } },
    });
  });
  await page.goto('/assistant');
  const consent = page.getByRole('checkbox', { name: /OpenAI/ });
  await expect(consent).not.toBeChecked();
  await page.getByRole('button', { name: '思绪停不下来' }).click();
  await expect(page.getByRole('button', { name: '推荐 · 思绪整理' })).toBeVisible();
  await consent.check();
  await page.getByRole('button', { name: '重新生成' }).click();
  await expect(page.getByText(/AI 消息发得有点快/)).toBeVisible();
  await expect(page.getByRole('button', { name: '重试回复' })).toBeDisabled();
  await expect(page.getByText('请求未完成', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '改用本地知识' }).click();
  expect(choices).toEqual([false, true]);
  await page.getByRole('button', { name: '重试回复' }).click();
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
  await expect(page.getByLabel('今晚想聊什么')).toHaveValue('有呀有呀');
  expect(modes).toEqual(['ai']);
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.assistant-reply-mode')).toHaveText('本地知识');
  finish();
  await expect(page.getByText('迟到的模型答复')).toHaveCount(0);
  await page.getByLabel('今晚想聊什么').fill('呃呃呃');
  await page.getByRole('button', { name: '发送' }).click();
  await expect.poll(() => modes).toEqual(['ai', 'local', 'local']);
});

test('每日次数暂停发送但保留草稿和会话，到期后等待手动发送', async ({ page }) => {
  await page.clock.install();
  await page.route('**/api/assistant/status', (route) =>
    route.fulfill({ json: { provider: 'deepseek', knowledgeVersion: 'fixture' } }),
  );
  const sent: string[] = [];
  await page.route('**/api/assistant/chat', (route) => {
    sent.push(route.request().postDataJSON().messages.at(-1));
    return route.fulfill({
      status: 429,
      headers: { 'Retry-After': '30' },
      json: { error: { code: 'MODEL_LIMIT' } },
    });
  });
  await page.goto('/assistant');
  await page.getByRole('checkbox', { name: /DeepSeek/ }).check();
  const draft = page.getByLabel('今晚想聊什么');
  const send = page.getByRole('button', { name: '发送', exact: true });
  await draft.fill('今天天气不错');
  await send.click();
  await expect(send).toBeDisabled();
  const notice = page.locator('#assistant-composer-status');
  await expect(notice).toContainText('后可以再试');
  await expect(draft).toBeEditable();
  await draft.fill('我想说另一件事');
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).requestSubmit());
  expect(sent).toEqual(['今天天气不错']);
  await page.clock.fastForward(30_100);
  await expect(send).toBeEnabled();
  await expect(draft).toHaveValue('我想说另一件事');
  await expect(page.getByText('今天天气不错', { exact: true })).toBeVisible();
  expect(sent).toEqual(['今天天气不错']);
  await send.click();
  await expect.poll(() => sent).toEqual(['今天天气不错', '我想说另一件事']);
});

test('预算恢复查询不提交草稿，恢复后手动发送走同一模型', async ({ page }) => {
  await page.clock.install();
  await page.route('**/api/assistant/status', (route) =>
    route.fulfill({
      json: {
        provider: 'deepseek',
        providers: [{ id: 'deepseek', model: 'deepseek-flash' }],
        knowledgeVersion: 'fixture',
      },
    }),
  );
  let sent = 0;
  let checks = 0;
  await page.route('**/api/assistant/availability?*', (route) => {
    checks++;
    const url = new URL(route.request().url());
    expect([...url.searchParams.keys()].sort()).toEqual(['model', 'provider', 'reservation']);
    return route.fulfill({ json: { available: true } });
  });
  await page.route('**/api/assistant/chat', (route) => {
    sent++;
    expect(route.request().postDataJSON().mode).toBe('ai');
    if (sent > 1)
      return route.fulfill({
        contentType: 'application/x-ndjson',
        body:
          [
            { type: 'start', mode: 'model' },
            { type: 'text', text: '听你说。' },
            { type: 'done', actions: [], sources: [] },
          ]
            .map((event) => JSON.stringify(event))
            .join('\n') + '\n',
      });
    return route.fulfill({
      status: 429,
      headers: { 'X-JHaven-Reservation': '0.002' },
      json: { error: { code: 'MODEL_BUDGET' } },
    });
  });
  await page.goto('/assistant');
  await page.getByRole('checkbox', { name: /DeepSeek/ }).check();
  const draft = page.getByLabel('今晚想聊什么');
  await draft.fill('原本的内容');
  const send = page.getByRole('button', { name: '发送', exact: true });
  await send.click();
  await expect(page.locator('#assistant-composer-status')).toContainText('站内额度可用后');
  await expect(send).toBeDisabled();
  await expect(draft).toHaveAttribute('aria-describedby', /assistant-composer-status/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await draft.fill('编辑后的草稿');
  await page.clock.fastForward(5100);
  await expect(send).toBeEnabled();
  expect(checks).toBe(1);
  expect(sent).toBe(1);
  await expect(draft).toHaveValue('编辑后的草稿');
  await expect(page.getByRole('checkbox', { name: /DeepSeek/ })).toBeChecked();
  await send.click();
  await expect(
    page.getByRole('region', { name: '完整对话' }).getByText('听你说。', { exact: true }),
  ).toBeVisible();
  expect(sent).toBe(2);
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
  await page.getByRole('checkbox', { name: '使用 DeepSeek 聊天' }).check();
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
  await page.getByText('参考资料', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'NHLBI 睡眠习惯' })).toBeVisible();
});
test('DeepSeek 回退展示原因并保留草稿，手动重试可收到模型回复', async ({ page }) => {
  await page.route('**/api/assistant/status', (route) =>
    route.fulfill({
      json: {
        provider: 'deepseek',
        providers: [{ id: 'deepseek', model: 'deepseek-flash' }],
        knowledgeVersion: 'fixture',
      },
    }),
  );
  let calls = 0;
  const question = '你说人为什么总是这样啊，白天想休息，晚上又不想睡。';
  await page.route('**/api/assistant/chat', (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      mode: 'ai',
      provider: 'deepseek',
      model: 'deepseek-flash',
      messages: [question],
    });
    const fallback = ++calls === 1;
    return route.fulfill({
      contentType: 'application/x-ndjson',
      body:
        [
          fallback
            ? {
                type: 'start',
                mode: 'local',
                source: 'fallback',
                fallbackCode: 'provider_invalid_output',
              }
            : { type: 'start', mode: 'model' },
          {
            type: 'text',
            text: fallback
              ? '暂时没有可用的模型回复。'
              : '白天盼着休息，晚上又舍不得把今天交出去。',
          },
          { type: 'done', sources: [], actions: [] },
        ]
          .map((event) => JSON.stringify(event))
          .join('\n') + '\n',
    });
  });
  await page.goto('/assistant');
  await page.getByRole('checkbox', { name: /DeepSeek/ }).check();
  const draft = page.getByLabel('今晚想聊什么');
  await draft.fill(question);
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByText('本地回退', { exact: true })).toBeVisible();
  await expect(page.getByText('模型返回格式异常。', { exact: true })).toBeVisible();
  await expect(draft).toHaveValue(question);
  await page.getByRole('button', { name: '重试回复' }).click();
  await expect(
    page
      .getByRole('region', { name: '完整对话' })
      .getByText('白天盼着休息，晚上又舍不得把今天交出去。'),
  ).toBeVisible();
  await expect(page.getByText('本地回退', { exact: true })).toHaveCount(0);
  expect(calls).toBe(2);
});

test('模型拒答与站内限制均保留草稿，并提供不同反馈', async ({ page }) => {
  await page.route('**/api/assistant/status', (route) =>
    route.fulfill({
      json: {
        provider: 'deepseek',
        providers: [{ id: 'deepseek', model: 'deepseek-flash' }],
        knowledgeVersion: 'fixture',
      },
    }),
  );
  let calls = 0;
  await page.route('**/api/assistant/chat', (route) => {
    if (++calls === 1) {
      return route.fulfill({ status: 422, json: { error: { code: 'provider_content_filtered' } } });
    }
    return route.fulfill({
      contentType: 'application/x-ndjson',
      body:
        [
          { type: 'start', mode: 'local', inputRestricted: true },
          { type: 'text', text: '请不要发送联系方式。' },
          { type: 'done', sources: [], actions: [] },
        ]
          .map((frame) => JSON.stringify(frame))
          .join('\n') + '\n',
    });
  });
  await page.goto('/assistant');
  await page.getByRole('checkbox', { name: '使用 DeepSeek 聊天' }).check();
  const draft = page.getByLabel('今晚想聊什么');
  const send = page.getByRole('button', { name: '发送', exact: true });
  const text = '砍掉不重要的功能，先保住演示。';
  await draft.fill(text);
  await send.click();
  await expect(page.getByText(/草稿还在，可以调整措辞后再试/)).toBeVisible();
  await expect(draft).toHaveValue(text);
  const sensitive = '示例联系地址是 test@example.org';
  await draft.fill(sensitive);
  await send.click();
  await expect(
    page.getByRole('region', { name: '完整对话' }).getByText('请不要发送联系方式。'),
  ).toBeVisible();
  await expect(send).toBeEnabled();
  await expect(draft).toHaveValue(sensitive);
  expect(calls).toBe(2);
});
