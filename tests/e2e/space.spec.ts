import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('账户收藏导入冲突、默认设置、跨午夜日记与真实趋势', async ({ page }) => {
  test.skip(process.env.JHAVEN_TEST_MYSQL !== '1', '需要已迁移的隔离 MySQL。');
  expect(process.env.DB_NAME).toMatch(/^jhaven_test_/);
  test.setTimeout(60_000);
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
  await page.getByRole('button', { name: '新增日记' }).click();
  await page.getByLabel('日记日期').fill('2026-11-12');
  await page.getByLabel('记录时区').fill('Asia/Macau');
  await page.getByLabel('上床时间', { exact: true }).fill('2026-11-12T23:30');
  await page.getByLabel('醒来时间', { exact: true }).fill('2026-11-13T07:00');
  await page.getByLabel('主观休息感').selectOption({ label: '较好' });
  await page.getByLabel('备注（可选）').fill('隔离库的跨午夜记录');
  await page.getByRole('button', { name: '保存日记' }).click();
  await expect(page.getByText('日记已保存。')).toBeVisible();
  const range = async () => {
    await page.getByLabel('查询开始日期').fill('2026-11-10');
    await page.getByLabel('查询结束日期').fill('2026-11-14');
    await page.getByRole('button', { name: '查询日期' }).click();
    await expect(page.getByRole('region', { name: '趋势数据表' })).toContainText(
      '2026-11-13 07:00',
    );
  };
  await range();
  const series = page.getByRole('img', { name: /作息时间/ });
  await expect(series.locator('circle')).toHaveCount(2);
  await page.getByRole('button', { name: '最近 30 天' }).click();
  await expect(page.getByRole('button', { name: '最近 30 天' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(series.locator('circle')).toHaveCount(2);
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
  await expect(page.getByText('这段时间暂无记录。图表会在你记录后更新。')).toBeVisible();
});
