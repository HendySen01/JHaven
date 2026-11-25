import { ref, watch, onScopeDispose } from 'vue';
import { useAuthStore } from '../stores/auth';
import { withRequestDeadline } from './requestDeadline';

const messages: Record<string, string> = {
  INVALID_INPUT: '请检查输入和日期范围。',
  ENTRY_NOT_FOUND: '记录已删除或无法访问，请刷新。',
  ACCOUNT_CHANGED: '当前会话已变化，请重新选择账户。',
  UNAUTHENTICATED: '会话已结束，请重新登录。',
  DATABASE_UNAVAILABLE: '个人空间暂不可用，请稍后重试。',
  RATE_LIMITED: '操作过于频繁，请稍后重试。',
};
export class SpaceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function spaceRequest(
  account: string,
  path = '',
  method = 'GET',
  body?: unknown,
  parent?: AbortSignal,
) {
  return withRequestDeadline(
    10_000,
    async (signal) => {
      const response = await fetch(`/api/space${path}`, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
        headers: {
          'X-JHaven-Account': account,
          ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
      });
      const result = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) {
        const code = result?.error?.code;
        throw new SpaceError(
          code,
          code === 'ENTRY_CONFLICT'
            ? result.error.message
            : Object.hasOwn(messages, code)
              ? messages[code]!
              : '个人空间暂不可用，请稍后重试。',
        );
      }
      return result as unknown;
    },
    parent,
  );
}

// 每个视图的账户数据只保存在内存；账号变更会终止进行中的读取和丢弃响应。
export function useSpaceRequests(reset: () => void) {
  const auth = useAuthStore();
  const busy = ref(false);
  const error = ref('');
  let active: AbortController | undefined;
  function clear() {
    active?.abort();
    active = undefined;
    busy.value = false;
    error.value = '';
    reset();
  }
  watch(() => auth.user?.id, clear, { flush: 'sync' });
  onScopeDispose(clear);
  async function run(
    action: (
      request: (path?: string, method?: string, body?: unknown) => Promise<unknown>,
    ) => Promise<void>,
  ) {
    const id = auth.user?.id;
    if (!id || active) return;
    const controller = new AbortController();
    active = controller;
    busy.value = true;
    error.value = '';
    try {
      await action(async (path, method, body) => {
        const result = await spaceRequest(id, path, method, body, controller.signal);
        if (controller.signal.aborted || auth.user?.id !== id)
          throw new DOMException('Aborted', 'AbortError');
        return result;
      });
    } catch (issue) {
      if (active !== controller) return;
      if (
        issue instanceof SpaceError &&
        ['UNAUTHENTICATED', 'ACCOUNT_CHANGED'].includes(issue.code)
      ) {
        clear();
        if (issue.code === 'UNAUTHENTICATED') auth.user = null;
        else {
          auth.user = null;
          await auth.refreshAccount();
        }
      } else
        error.value =
          issue instanceof SpaceError ? issue.message : '操作未完成，请检查输入或网络后重试。';
    } finally {
      if (active === controller) {
        active = undefined;
        busy.value = false;
      }
    }
  }
  return { busy, error, run };
}
