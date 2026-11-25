import { randomBytes } from 'node:crypto';
import { expect } from '@playwright/test';
import { test } from './isolated-client.js';
import { removeUnsupportedSafariApis } from './safari-api-probe.js';

test('聊天历史跨会话恢复、手动和自动保存、搜索与删除', async ({ page, browser, baseURL }) => {
  test.skip(process.env.JHAVEN_TEST_POSTGRES !== '1', '需要隔离 PostgreSQL。');
  test.setTimeout(90_000);
  await removeUnsupportedSafariApis(page);
  const username = 'history_' + randomBytes(8).toString('hex');
  const password = '仅供隔离库验证的临时口令 934';
  const authHeaders = { Origin: baseURL! };
  await expect(
    (
      await page.request.post('/api/auth/register', {
        headers: authHeaders,
        data: { username, password },
      })
    ).status(),
  ).toBe(201);
  const login = await page.request.post('/api/auth/login', {
    headers: authHeaders,
    data: { username, password },
  });
  expect(login.ok()).toBe(true);
  const account = await login.json();
  const historyApi = () =>
    page.request.get('/api/space/chat', { headers: { 'X-JHaven-Account': account.id } });
  let chats = 0;
  await page.route('**/api/assistant/status', (route) =>
    route.fulfill({ json: { provider: 'deepseek', knowledgeVersion: 'test' } }),
  );
  await page.route('**/api/assistant/chat', (route) => {
    chats++;
    return route.fulfill({
      contentType: 'application/x-ndjson',
      body:
        [
          { type: 'start', mode: route.request().postDataJSON().mode === 'ai' ? 'model' : 'local' },
          { type: 'text', text: '窗边有一轮月亮。' },
          { type: 'done', sources: [], actions: [] },
        ]
          .map((event) => JSON.stringify(event))
          .join('\n') + '\n',
    });
  });
  await page.goto('/assistant');
  const send = async (text: string) => {
    await page.getByLabel('今晚想聊什么').fill(text);
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.getByLabel('今晚想聊什么')).toHaveValue('');
  };
  await page.getByRole('checkbox', { name: /DeepSeek/ }).check();
  await send('今晚天气怎样');
  expect(await (await historyApi()).json()).toEqual([]);
  await page.getByRole('checkbox', { name: /DeepSeek/ }).uncheck();
  await send('我想看看窗外');
  await page.route('**/api/space/chat/*', async (route) => {
    if (route.request().method() === 'PUT') await route.abort();
    else await route.continue();
  });
  await page.getByRole('button', { name: '保存对话' }).click();
  await expect(page.getByRole('alert')).toContainText('当前对话仍保留在页面');
  await expect(page.getByText('今晚天气怎样', { exact: true })).toBeVisible();
  await page.unroute('**/api/space/chat/*');
  await page.getByRole('button', { name: '保存对话' }).click();
  await expect(page.getByText('对话已保存。')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '历史记录' }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByRole('checkbox', { name: '自动保存后续对话' })).not.toBeChecked();
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await modal.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  }
  await modal.getByRole('button', { name: '重命名' }).click();
  await modal.getByRole('textbox', { name: '新标题' }).fill('我的夜间对话');
  await modal.getByRole('button', { name: '保存标题' }).click();
  await modal.getByLabel('搜索标题或消息').fill('一轮月亮');
  await modal.getByLabel('回答来源').selectOption('mixed');
  await modal.getByRole('button', { name: '查询历史' }).click();
  await expect(modal.getByText('DeepSeek · 本地知识')).toBeVisible();
  const another = await browser.newContext({ baseURL: baseURL! });
  try {
    const session = await another.request.post('/api/auth/login', {
      headers: authHeaders,
      data: { username, password },
    });
    expect(session.ok()).toBe(true);
    const otherPage = await another.newPage();
    await otherPage.goto('/assistant');
    await otherPage.getByRole('button', { name: '历史记录' }).click();
    await expect(otherPage.getByRole('button', { name: '我的夜间对话' })).toBeVisible();
  } finally {
    await another.close();
  }
  await modal.getByRole('checkbox', { name: '自动保存后续对话' }).check();
  await modal.getByRole('button', { name: '我的夜间对话' }).click();
  await expect(modal).toHaveCount(0);
  expect(chats).toBe(2);
  await send('继续聊天');
  await expect(page.getByText('已自动保存。')).toBeVisible();
  await page.getByRole('button', { name: '新建对话' }).click();
  await expect(page.getByText('继续聊天', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '历史记录' }).click();
  await modal.getByRole('checkbox', { name: '自动保存后续对话' }).uncheck();
  await modal.getByRole('button', { name: '清空聊天历史' }).click();
  await modal.getByRole('button', { name: '保留', exact: true }).click();
  await expect(modal.getByRole('button', { name: '我的夜间对话' })).toBeVisible();
  await modal.getByRole('button', { name: '删除', exact: true }).click();
  await modal.getByRole('button', { name: '确认删除对话' }).click();
  await expect(modal.getByText('没有符合条件的已保存对话。')).toBeVisible();
  await modal.getByRole('button', { name: '关闭聊天历史' }).click();
  await send('这句不自动保存');
  expect(await (await historyApi()).json()).toEqual([]);
  await page.getByRole('link', { name: '我的账户' }).click();
  await page.getByRole('button', { name: '退出登录' }).click();
  await page.getByRole('link', { name: '睡前助手' }).click();
  await expect(page.getByText('这句不自动保存', { exact: true })).toHaveCount(0);
});
