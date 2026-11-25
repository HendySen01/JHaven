// 兼容 Safari 15.6，并让超时覆盖读取响应正文的整个过程。
export async function withRequestDeadline<T>(
  milliseconds: number,
  request: (signal: AbortSignal) => Promise<T>,
  parent?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (parent?.aborted) throw new DOMException('请求已取消。', 'AbortError');
  parent?.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    if (controller.signal.aborted) return;
    timedOut = true;
    controller.abort();
  }, milliseconds);
  try {
    const result = await request(controller.signal);
    if (controller.signal.aborted) throw new DOMException('请求已取消。', 'AbortError');
    return result;
  } catch (error) {
    if (timedOut) throw new DOMException('请求等待超时。', 'TimeoutError');
    throw error;
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', cancel);
  }
}
