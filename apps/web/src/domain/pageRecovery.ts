// 仅保存浏览位置与明确允许的界面参数；不要将表单正文、认证信息写入这里。
export const PAGE_VIEW_PREFIX = 'jhaven.page.view.v1:';
export const PAGE_VIEW_TTL = 30 * 24 * 60 * 60 * 1000;
const maxOffset = 10_000_000;
const maxEntries = 80;

export type PagePosition = {
  top: number;
  anchor: string | null;
  offset: number;
  inner?: number;
};
export type ReadingPosition = { top: number; index: number; offset: number; following: boolean };
export type JournalViewPreference = { from: string; to: string; days: 7 | 30 };
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export function safeOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= maxOffset;
}
export function parsePagePosition(value: unknown): PagePosition | null {
  const v = value as PagePosition | null;
  if (
    !v ||
    !safeOffset(v.top) ||
    v.top < 0 ||
    !safeOffset(v.offset) ||
    !(
      v.anchor === null ||
      (typeof v.anchor === 'string' && /^[a-z0-9:_-]{1,100}$/i.test(v.anchor))
    ) ||
    (v.inner !== undefined && (!safeOffset(v.inner) || v.inner < 0))
  )
    return null;
  return {
    top: v.top,
    anchor: v.anchor,
    offset: v.offset,
    ...(v.inner === undefined ? {} : { inner: v.inner }),
  };
}
export function parseReadingPosition(value: unknown): ReadingPosition | null {
  const v = value as ReadingPosition | null;
  if (
    !v ||
    !safeOffset(v.top) ||
    v.top < 0 ||
    !safeOffset(v.offset) ||
    !Number.isInteger(v.index) ||
    v.index < 0 ||
    v.index >= 500 ||
    typeof v.following !== 'boolean'
  )
    return null;
  return { top: v.top, index: v.index, offset: v.offset, following: v.following };
}
export function parseJournalPreference(value: unknown): JournalViewPreference | null {
  const v = value as JournalViewPreference | null;
  const date = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!v || !date(v.from) || !date(v.to) || v.from > v.to || (v.days !== 7 && v.days !== 30))
    return null;
  return { from: v.from, to: v.to, days: v.days };
}
export function parseConversationId(value: unknown): string | null {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}
export function isAudioPage(path: string) {
  return /^\/relax(?:\/|$)/.test(path);
}
export function isPrivatePage(path: string) {
  return ['/journal', '/assistant', '/account'].includes(path);
}
export function pageViewKey(path: string, identity: string | null | undefined): string | null {
  if (isPrivatePage(path)) {
    if (identity === undefined || (path === '/account' && !identity)) return null;
    return identity ? privateViewKey(identity, 'route:' + path) : 'guest:route:' + path;
  }
  if (
    ['/', '/about', '/sound-evidence', '/relaxation-evidence'].includes(path) ||
    /^\/practice\/[a-z0-9-]{1,40}$/.test(path)
  )
    return 'device:route:' + path;
  return null;
}
export function privateViewKey(identity: string, purpose: string) {
  return 'account:' + encodeURIComponent(identity) + ':' + purpose;
}
export function scrollTarget(
  top: number,
  offset: number,
  current: number,
  anchorTop: number | null,
  max: number,
) {
  return Math.max(
    0,
    Math.min(Math.max(0, max), anchorTop === null ? top : current + anchorTop - offset),
  );
}

function browserStorage(): StorageLike | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
export function readView<T>(
  key: string,
  parse: (value: unknown) => T | null,
  storage = browserStorage(),
  now = Date.now(),
): T | null {
  try {
    const raw = storage?.getItem(PAGE_VIEW_PREFIX + key);
    if (!raw || raw.length > 4096) return null;
    const record = JSON.parse(raw);
    if (
      !record ||
      !Number.isFinite(record.at) ||
      record.at > now ||
      now - record.at > PAGE_VIEW_TTL
    )
      return null;
    return parse(record.value);
  } catch {
    return null;
  }
}
export function writeView(
  key: string,
  value: unknown,
  storage = browserStorage(),
  now = Date.now(),
) {
  try {
    if (!storage) return;
    const fullKey = PAGE_VIEW_PREFIX + key;
    const serialized = JSON.stringify({ at: now, value });
    if (serialized.length > 4096) return;
    const existing = storage.getItem(fullKey) !== null;
    storage.setItem(fullKey, serialized);
    // 已有坐标的节流更新不必每次扫描所有存储键。
    if (existing) return;
    const entries: { key: string; at: number }[] = [];
    for (let i = 0; i < storage.length; i++) {
      const item = storage.key(i);
      if (!item?.startsWith(PAGE_VIEW_PREFIX) || item === fullKey) continue;
      let at = 0;
      try {
        at = Number(JSON.parse(storage.getItem(item) ?? '').at) || 0;
      } catch {
        /* 无效记录 */
      }
      entries.push({ key: item, at });
    }
    entries.sort((a, b) => b.at - a.at);
    entries.forEach((item, i) => {
      if (i >= maxEntries - 1 || now - item.at > PAGE_VIEW_TTL) storage.removeItem(item.key);
    });
  } catch {
    /* 浏览器禁用存储或配额不足时不影响正常使用 */
  }
}
export function removeView(key: string, storage = browserStorage()) {
  try {
    storage?.removeItem(PAGE_VIEW_PREFIX + key);
  } catch {
    /* 不影响正常使用 */
  }
}
export function clearOtherPrivateViews(identity: string | null, storage = browserStorage()) {
  try {
    if (!storage) return;
    const prefix = PAGE_VIEW_PREFIX + 'account:';
    const keep = identity ? PAGE_VIEW_PREFIX + privateViewKey(identity, '') : null;
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key?.startsWith(prefix) && (!keep || !key.startsWith(keep))) storage.removeItem(key);
    }
  } catch {
    /* 不影响退出登录 */
  }
}

export function forgetChatViews(identity: string, id?: string, storage = browserStorage()) {
  try {
    if (!storage) return;
    const prefix = PAGE_VIEW_PREFIX + privateViewKey(identity, 'chat:');
    if (id) removeView(privateViewKey(identity, 'chat:' + id), storage);
    else {
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (key?.startsWith(prefix)) storage.removeItem(key);
      }
    }
    const pointer = privateViewKey(identity, 'last-chat');
    if (!id || readView(pointer, parseConversationId, storage) === id) removeView(pointer, storage);
  } catch {
    /* 存储失败不影响已完成的服务端删除 */
  }
}
