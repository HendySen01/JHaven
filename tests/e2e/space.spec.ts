import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { removeUnsupportedSafariApis } from './safari-api-probe.js';

test('账户收藏导入冲突、默认设置、跨午夜日记与真实趋势', async ({
  page,
  browserName,
  hasTouch,
}) => {
  test.skip(process.env.JHAVEN_TEST_POSTGRES !== '1', '需要已迁移的隔离 PostgreSQL。');
  test.setTimeout(60_000);
  await removeUnsupportedSafariApis(page);
  page.on('dialog', (dialog) => void dialog.accept());
  const user = `space_${randomBytes(7).toString('hex')}`;
  const password = '仅用于隔离测试的临时账户口令 13';
  const openAccount = async () => {
    await page.getByLabel('用户名').fill(user);
    await page.getByLabel('密码', { exact: true }).fill(password);
    await page.locator('form').getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL('/account');
    await expect(page.getByRole('heading', { name: '我的声音场景' })).toBeVisible();
  };
  await page.goto('/relax');
  await page.getByLabel('自定义场景名称').fill('设备雨夜');
  await page.getByRole('button', { name: '另存场景', exact: true }).click();
  await page.goto('/register');
  await page.getByLabel('用户名').fill(user);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByLabel('确认密码').fill(password);
  await page.locator('form').getByRole('button', { name: '注册', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await openAccount();
  const importPreset = async () => {
    await page.getByLabel('设备收藏或预设').selectOption({ label: '设备雨夜' });
    await page.getByRole('button', { name: '复制到表单' }).click();
    await page.getByRole('button', { name: '保存账户场景' }).click();
  };
  await page.getByText('新建、导入或编辑场景', { exact: true }).click();
  await importPreset();
  await expect(page.getByRole('link', { name: '使用场景 设备雨夜' })).toBeVisible();
  await importPreset();
  await expect(page.getByRole('alert')).toContainText('已有同名场景');
  await page.getByRole('button', { name: '编辑 设备雨夜' }).click();
  await expect(page.getByLabel('账户场景名称')).toBeFocused();
  await page.getByLabel('账户场景名称').fill('账户雨夜');
  await page.getByRole('spinbutton', { name: '雨声账户音量', exact: true }).fill('24');
  await page.getByRole('button', { name: '保存场景修改' }).click();
  await page.getByLabel('默认场景').selectOption({ label: '账户雨夜' });
  await page.getByLabel('默认音量').fill('27');
  await page.getByLabel('定时分钟（0 为不定时）').fill('10');
  await page.getByRole('button', { name: '保存默认设置' }).click();
  await expect(page.getByText('默认播放设置已保存。')).toBeVisible();
  await page.getByRole('button', { name: '应用默认设置' }).click();
  await page.getByRole('link', { name: '打开声音库' }).click();
  await expect(page.getByRole('heading', { name: '账户雨夜' })).toBeVisible();
  await expect(page.getByRole('slider', { name: '总音量' })).toHaveValue('27');
  await expect(page.getByRole('slider', { name: '雨声音量', exact: true })).toHaveValue('24');
  await expect(page.getByRole('combobox', { name: '停止时间' })).toHaveValue('10');
  await expect(page.getByRole('button', { name: '播放混音' })).toBeEnabled();
  await page.getByRole('link', { name: '睡眠日记', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /0 条记录/ })).toBeVisible();
  const journal = page.getByRole('region', { name: '日记查询结果' });
  const graph = page.locator('.journal-trend');
  await graph.evaluate((node) => node.setAttribute('data-test-retained', 'true'));
  const initialHeight = await graph.evaluate((node) => node.clientHeight);
  await page.getByRole('button', { name: '最近 30 天' }).scrollIntoViewIfNeeded();
  const trendScroll = await page.evaluate(() => scrollY);
  await page.getByRole('button', { name: '最近 30 天' }).click();
  await expect(page.getByRole('button', { name: '最近 30 天' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: '最近 30 天' })).toBeEnabled();
  // 浏览器的滚动坐标可能在布局更新后发生亚像素取整。
  expect(Math.abs((await page.evaluate(() => scrollY)) - trendScroll)).toBeLessThan(0.5);
  await page.getByRole('button', { name: '最近 7 天' }).click();
  await expect(page.getByRole('button', { name: '最近 7 天' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: '最近 7 天' })).toBeEnabled();
  expect(Math.abs((await page.evaluate(() => scrollY)) - trendScroll)).toBeLessThan(0.5);
  await expect(graph).toHaveAttribute('data-test-retained', 'true');
  await page.getByRole('button', { name: '新增日记' }).click();
  await expect(page.getByRole('heading', { name: '新建日记' })).toBeFocused();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('button', { name: '新增日记' })).toBeFocused();
  await page.getByRole('button', { name: '新增日记' }).click();
  await page.getByLabel('日记日期').fill('2026-11-12');
  await page.getByLabel('记录时区').fill('Asia/Macau');
  await page.getByRole('button', { name: /^上床时间：/ }).click();
  let picker = page.getByRole('dialog', { name: '上床时间' });
  await picker.getByRole('listbox', { name: '小时' }).press('End');
  const minutes = picker.getByRole('listbox', { name: '分钟' });
  await minutes.scrollIntoViewIfNeeded();
  const wheel = (await minutes.boundingBox())!;
  const x = Math.round(wheel.x + wheel.width / 2);
  const y = Math.round(wheel.y + wheel.height / 2);
  if (!hasTouch) {
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, 110);
    await expect.poll(() => minutes.evaluate((node) => node.scrollTop)).toBe(120);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 64, { steps: 5 });
    await expect(minutes).toHaveClass(/dragging/);
    await page.mouse.up();
    await expect.poll(() => minutes.evaluate((node) => node.scrollTop)).toBeGreaterThan(120);
  } else if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (const offset of [12, 26, 45, 65])
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y - offset }],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await expect.poll(() => minutes.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  }
  await minutes.press('Home');
  for (let i = 0; i < 6; i++) await minutes.press('PageDown');
  await picker.getByRole('button', { name: '应用日期和时间' }).click();
  await expect(page.getByRole('button', { name: '上床时间：2026-11-12 23:30' })).toBeFocused();
  await page.getByRole('button', { name: /^醒来时间：/ }).click();
  picker = page.getByRole('dialog', { name: '醒来时间' });
  await picker.getByRole('button', { name: '2026-11-13' }).click();
  const hours = picker.getByRole('listbox', { name: '小时' });
  await hours.press('Home');
  await hours.press('PageDown');
  await hours.press('ArrowDown');
  await hours.press('ArrowDown');
  await picker.getByRole('button', { name: '应用日期和时间' }).click();
  await page.getByRole('combobox', { name: '醒来感觉' }).selectOption({ label: '较好' });
  await page.getByLabel('备注（可选）').fill('隔离库的跨午夜记录');
  await page.getByRole('button', { name: '保存日记' }).click();
  await expect(page.getByText('日记已保存。')).toBeVisible();
  const range = async () => {
    await page.getByLabel('查询开始日期').fill('2026-11-10');
    await page.getByLabel('查询结束日期').fill('2026-11-14');
    const submit = page.getByRole('button', { name: '查询日期' });
    await submit.scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => scrollY);
    let finishQuery: () => void = () => {};
    let markRouteReady: () => void = () => {};
    const routeReady = new Promise<void>((resolve) => {
      markRouteReady = resolve;
    });
    const path = /\/api\/space\/diary\?from=2026-11-10&to=2026-11-14$/;
    await page.route(
      path,
      async (route) => {
        await new Promise<void>((resolve) => {
          finishQuery = resolve;
          markRouteReady();
        });
        await route.continue();
      },
      { times: 1 },
    );
    await submit.click();
    await routeReady;
    try {
      await expect(page.getByRole('button', { name: '查询中…' })).toBeDisabled();
      await expect(journal).toHaveAttribute('aria-busy', 'true');
      expect(await page.evaluate(() => scrollY)).toBe(scroll);
    } finally {
      finishQuery();
    }
    await expect(page.getByRole('region', { name: '当日睡眠详情' })).toContainText('次日 07:00');
    await expect(submit).toBeEnabled();
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
  };
  await range();
  await expect(
    page.getByRole('status').filter({ hasText: '2026-11-10 至 2026-11-14 · 1 条记录' }),
  ).toBeVisible();
  await expect(graph).toHaveAttribute('data-test-retained', 'true');
  expect(await graph.evaluate((node) => node.clientHeight)).toBe(initialHeight);
  await page.getByRole('button', { name: '新增日记' }).click();
  await page.getByLabel('日记日期').fill('2026-11-11');
  await page.getByLabel('备注（可选）').fill('第二条隔离记录');
  await page.getByRole('button', { name: '保存日记' }).click();
  await expect(page.getByRole('status').filter({ hasText: /2 条记录/ })).toBeVisible();
  await expect(journal.getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: '删除 2026-11-11' }).click();
  await expect(page.getByRole('status').filter({ hasText: /1 条记录/ })).toBeVisible();
  const selectedDay = page.getByRole('button', { name: '2026-11-12，查看睡眠记录' });
  await expect(selectedDay.locator('.trend-marker')).toHaveCount(2);
  await expect(selectedDay.locator('.trend-sleep')).toHaveCount(0);
  await selectedDay.focus();
  await expect(page.getByRole('region', { name: '当日睡眠详情' })).toContainText('较好');
  await page.getByRole('button', { name: '最近 30 天' }).click();
  await expect(page.getByRole('button', { name: '最近 30 天' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await selectedDay.click();
  await expect(page.getByRole('region', { name: '当日睡眠详情' })).toContainText('次日 07:00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '编辑 2026-11-12' }).click();
  await page.getByLabel('备注（可选）').fill('已编辑的隔离记录');
  await page.getByRole('button', { name: '保存日记' }).click();
  await expect(page.getByText('已编辑的隔离记录', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '我的账户' }).click();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL('/login');
  await page.goto('/relax');
  await expect(page.getByRole('heading', { name: '账户雨夜' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '设备雨夜', exact: true })).toBeVisible();
  await page.goto('/login');
  await openAccount();
  await expect(page.getByRole('link', { name: '使用场景 账户雨夜' })).toBeVisible();
  await expect(page.getByLabel('默认音量')).toHaveValue('27');
  await page.getByRole('button', { name: '删除 账户雨夜' }).click();
  await expect(page.getByRole('link', { name: '使用场景 账户雨夜' })).toHaveCount(0);
  await expect(page.getByLabel('默认场景')).toHaveValue('');
  await page.getByRole('link', { name: '我的睡眠日记' }).click();
  await range();
  await expect(page.getByText('已编辑的隔离记录', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '删除 2026-11-12' }).click();
  await expect(page.getByText('所选日期范围内没有日记。')).toBeVisible();
  await expect(page.getByText('这段时间没有日记。', { exact: true })).toBeVisible();
});
