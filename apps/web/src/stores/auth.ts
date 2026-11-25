import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { accountSchema, type Account } from '@jhaven/shared';
import { withRequestDeadline } from '../lib/requestDeadline';

class AccountError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const messages: Record<string, string> = {
  INVALID_INPUT: '请检查用户名和密码格式。',
  USERNAME_UNAVAILABLE: '这个用户名无法注册，请换一个。',
  INVALID_CREDENTIALS: '用户名或密码不正确。',
  DATABASE_UNAVAILABLE: '账户数据库暂未就绪，请稍后重试。',
  INVALID_ORIGIN: '当前访问地址与账户服务配置不一致。',
  RATE_LIMITED: '尝试次数过多，请稍后再试。',
  AUTH_BUSY: '认证请求较多，请稍后重试。',
};

async function request(path: string, body?: Record<string, string>): Promise<unknown> {
  return withRequestDeadline(10_000, async (signal) => {
    const response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
      ...(body
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {}),
    }).catch(() => {
      throw new AccountError(0, '无法连接账户服务，请检查网络后重试。');
    });
    if (response.status === 204) return null;
    const value = await response.json().catch(() => null);
    if (!response.ok) {
      const code = value?.error?.code;
      throw new AccountError(
        response.status,
        typeof code === 'string' && Object.hasOwn(messages, code)
          ? messages[code]!
          : '账户服务暂不可用，请稍后重试。',
      );
    }
    return value;
  });
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<Account | null>(null);
  const initialized = ref(false);
  const initializing = ref(false);
  const pending = ref(false);
  const error = ref('');
  const registeredUsername = ref('');
  const signedIn = computed(() => user.value !== null);
  let restoring: Promise<void> | undefined;
  let identityRevision = 0;

  async function restore() {
    if (initialized.value) return;
    if (restoring) return restoring;
    initializing.value = true;
    restoring = (async () => {
      try {
        user.value = accountSchema.parse(await request('/api/auth/me'));
        initialized.value = true;
      } catch (issue) {
        if (issue instanceof AccountError && issue.status === 401) initialized.value = true;
        else error.value = '暂时无法检查登录状态。';
      } finally {
        initializing.value = false;
        restoring = undefined;
      }
    })();
    return restoring;
  }

  async function submit(
    mode: 'register' | 'login' | 'logout',
    payload: Record<string, string> = {},
  ) {
    if (pending.value) return false;
    pending.value = true;
    identityRevision++;
    error.value = '';
    try {
      if (restoring) await restoring;
      error.value = '';
      const value = await request(`/api/auth/${mode}`, payload);
      if (mode === 'login') user.value = accountSchema.parse(value);
      else if (mode === 'logout') user.value = null;
      else registeredUsername.value = payload.username ?? '';
      if (mode !== 'register') registeredUsername.value = '';
      initialized.value = true;
      return true;
    } catch (issue) {
      error.value =
        issue instanceof AccountError
          ? issue.message
          : issue instanceof DOMException && issue.name === 'TimeoutError'
            ? '账户服务等待超时，请重试。'
            : '账户服务响应异常，请重试。';
      return false;
    } finally {
      pending.value = false;
    }
  }

  async function refreshAccount() {
    if (pending.value) return false;
    const revision = ++identityRevision;
    error.value = '';
    try {
      const account = accountSchema.parse(await request('/api/account'));
      if (revision !== identityRevision) return false;
      user.value = account;
      return true;
    } catch (issue) {
      if (revision !== identityRevision) return false;
      if (issue instanceof AccountError && issue.status === 401) user.value = null;
      else error.value = issue instanceof AccountError ? issue.message : '无法读取当前账户。';
      return false;
    }
  }

  return {
    user,
    signedIn,
    initializing,
    initialized,
    pending,
    error,
    registeredUsername,
    restore,
    submit,
    refreshAccount,
  };
});
