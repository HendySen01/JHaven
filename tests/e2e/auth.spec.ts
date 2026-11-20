import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('访客可用声音库，账户页需由服务端确认会话', async ({ page }) => {
  await page.goto('/relax');
  await expect(page.getByRole('button', { name: '播放混音', exact: true })).toBeEnabled();
  await page.goto('/account');
  await expect(page).toHaveURL('/login');
  const form = page.locator('.auth-form');
  await form.getByRole('button', { name: '登录', exact: true }).click();
  await expect(form.getByLabel('用户名')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByLabel('密码', { exact: true })).toHaveAttribute('aria-invalid', 'true');
});

test('真实注册、登录失败、登录成功、刷新恢复和退出', async ({ page }) => {
  test.skip(process.env.JHAVEN_TEST_POSTGRES !== '1', '需要已迁移的独立 PostgreSQL 测试库。');
  const username = `browser_${randomBytes(8).toString('hex')}`;
  const password = '仅用于浏览器测试的临时密码 932';
  await page.goto('/register');
  const form = page.locator('.auth-form');
  await expect(form.getByLabel('密码', { exact: true })).toHaveAttribute(
    'autocomplete',
    'new-password',
  );
  await form.getByLabel('用户名').fill(username);
  await form.getByLabel('密码', { exact: true }).fill(password);
  await form.getByLabel('确认密码').fill('和上次不一致的测试口令');
  await form.getByRole('button', { name: '注册', exact: true }).click();
  await expect(form.getByText('两次输入的密码不一致。')).toBeVisible();
  await form.getByLabel('确认密码').fill(password);
  await form.getByRole('button', { name: '注册', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await expect(page.getByText('账户准备好了。用刚设置的密码登录吧。')).toBeVisible();
  await expect(form.getByLabel('密码', { exact: true })).toHaveAttribute(
    'autocomplete',
    'current-password',
  );
  await form.getByLabel('用户名').fill(username);
  await form.getByLabel('密码', { exact: true }).fill('incorrect password');
  await form.getByRole('button', { name: '登录', exact: true }).click();
  await expect(form.getByRole('alert')).toHaveText('用户名或密码不正确。');
  await form.getByLabel('密码', { exact: true }).fill(password);
  const loginResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/auth/login') && response.ok(),
  );
  await form.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL('/account');
  await expect(page.getByRole('heading', { name: '我的账户' })).toBeVisible();
  await expect(page.getByText(username, { exact: true })).toBeVisible();
  const cookie = (await page.context().cookies()).find((value) => value.name === 'jhaven_session');
  expect(cookie).toMatchObject({ httpOnly: true });
  const sessionHeader = await (await loginResponse).headerValue('set-cookie');
  expect(/;\s*SameSite=Lax(?:;|$)/i.test(sessionHeader ?? '')).toBe(true);
  expect(await page.evaluate(() => document.cookie.includes('jhaven_session'))).toBe(false);
  await page.reload();
  await expect(page.getByText(username, { exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL('/login');
  expect((await page.context().cookies()).some((value) => value.name === 'jhaven_session')).toBe(
    false,
  );
  await page.goto('/account');
  await expect(page).toHaveURL('/login');
});
