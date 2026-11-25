import { afterEach, expect, it, vi } from 'vitest';
import { withRequestDeadline } from './requestDeadline';

afterEach(() => vi.useRealTimers());

function waitForAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) =>
    signal.addEventListener('abort', () => reject(new DOMException('已取消', 'AbortError')), {
      once: true,
    }),
  );
}

it('将正文读取超时与旧版 Fetch 返回的 AbortError 区分开', async () => {
  vi.useFakeTimers();
  const result = withRequestDeadline(20, async (signal) => {
    await Promise.resolve();
    return waitForAbort(signal);
  });
  const assertion = expect(result).rejects.toHaveProperty('name', 'TimeoutError');
  await vi.advanceTimersByTimeAsync(20);
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
});

it('传播手动取消，不启动已取消的请求', async () => {
  vi.useFakeTimers();
  const parent = new AbortController();
  const result = withRequestDeadline(20, waitForAbort, parent.signal);
  parent.abort();
  await expect(result).rejects.toHaveProperty('name', 'AbortError');
  const unused = vi.fn(waitForAbort);
  await expect(withRequestDeadline(20, unused, parent.signal)).rejects.toHaveProperty(
    'name',
    'AbortError',
  );
  expect(unused).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
