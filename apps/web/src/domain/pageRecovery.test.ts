import { describe, expect, it } from 'vitest';
import {
  PAGE_VIEW_PREFIX,
  PAGE_VIEW_TTL,
  clearOtherPrivateViews,
  forgetChatViews,
  pageViewKey,
  parseConversationId,
  parseJournalPreference,
  parsePagePosition,
  parseReadingPosition,
  privateViewKey,
  readView,
  scrollTarget,
  writeView,
} from './pageRecovery';

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
  };
}
const position = { top: 800, anchor: 'journal-trends', offset: 64, inner: 90 };
const chatId = '8a1ccabd-2dc6-4277-a83a-e67e7a11b8ad';

describe('页面浏览恢复', () => {
  it('公开页面各自保存，私人页面按已验证的身份保存', () => {
    const storage = memoryStorage();
    const home = pageViewKey('/', undefined)!;
    const about = pageViewKey('/about', '12')!;
    const diary = pageViewKey('/journal', '12')!;
    writeView(home, position, storage, 100);
    writeView(about, { ...position, top: 400 }, storage, 101);
    writeView(diary, { ...position, top: 200 }, storage, 102);
    expect(readView(home, parsePagePosition, storage, 200)?.top).toBe(800);
    expect(readView(about, parsePagePosition, storage, 200)?.top).toBe(400);
    expect(readView(pageViewKey('/journal', '13')!, parsePagePosition, storage, 200)).toBeNull();
    expect(pageViewKey('/journal', undefined)).toBeNull();
    expect(pageViewKey('/account', null)).toBeNull();
    expect(pageViewKey('/relax', '12')).toBeNull();
    expect(pageViewKey('/login', '12')).toBeNull();
    expect(pageViewKey('/unknown', '12')).toBeNull();
  });
  it('退出、换账号清除旧私人位置但保留设备位置', () => {
    const storage = memoryStorage();
    const a = privateViewKey('1', 'route:/journal');
    const b = privateViewKey('10', 'route:/journal');
    const home = pageViewKey('/', null)!;
    for (const key of [a, b, home]) writeView(key, position, storage);
    clearOtherPrivateViews('10', storage);
    expect(readView(a, parsePagePosition, storage)).toBeNull();
    expect(readView(b, parsePagePosition, storage)).toEqual(position);
    clearOtherPrivateViews(null, storage);
    expect(readView(b, parsePagePosition, storage)).toBeNull();
    expect(readView(home, parsePagePosition, storage)).toEqual(position);
  });
  it('存储损坏、过期、被禁止时安全退回默认', () => {
    const storage = memoryStorage();
    const key = 'device:route:/';
    storage.setItem(PAGE_VIEW_PREFIX + key, '{invalid');
    expect(readView(key, parsePagePosition, storage)).toBeNull();
    writeView(key, position, storage, 1);
    expect(readView(key, parsePagePosition, storage, PAGE_VIEW_TTL + 2)).toBeNull();
    expect(readView(key, parsePagePosition, storage, 0)).toBeNull();
    const denied = {
      ...storage,
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(readView(key, parsePagePosition, denied)).toBeNull();
    expect(() => writeView(key, position, denied)).not.toThrow();
    expect(parsePagePosition({ ...position, top: -1 })).toBeNull();
    expect(parsePagePosition({ ...position, anchor: 'bad selector []' })).toBeNull();
    expect(parsePagePosition({ ...position, inner: -1 })).toBeNull();
  });
  it('布局变高后仍定位同一锚点，缺失时限制原像素', () => {
    expect(scrollTarget(800, 64, 0, 1000, 3000)).toBe(936);
    expect(scrollTarget(800, 64, 936, 64, 3000)).toBe(936);
    expect(scrollTarget(800, 64, 0, null, 500)).toBe(500);
    expect(scrollTarget(800, 64, 0, 20, 3000)).toBe(0);
  });
  it('只读取允许的界面参数，不携带正文或其他字段', () => {
    expect(parsePagePosition({ ...position, note: 'private' })).toEqual(position);
    const reading = { top: 600, index: 2, offset: -10, following: false };
    expect(parseReadingPosition({ ...reading, content: 'private' })).toEqual(reading);
    expect(parseReadingPosition({ ...reading, index: 500 })).toBeNull();
    expect(
      parseJournalPreference({ from: '2026-01-01', to: '2026-02-01', days: 30, note: 'private' }),
    ).toEqual({ from: '2026-01-01', to: '2026-02-01', days: 30 });
    expect(parseJournalPreference({ from: '2026-02-01', to: '2026-01-01', days: 30 })).toBeNull();
    expect(parseConversationId(chatId)).toBe(chatId);
    expect(parseConversationId('../other')).toBeNull();
  });
  it('删除聊天时移除相关浏览位置，不影响其他账户或公共页面', () => {
    const storage = memoryStorage();
    const key = privateViewKey('1', 'chat:' + chatId);
    const pointer = privateViewKey('1', 'last-chat');
    writeView(key, { top: 10, index: 0, offset: 0, following: true }, storage);
    writeView(pointer, chatId, storage);
    writeView(privateViewKey('2', 'last-chat'), chatId, storage);
    forgetChatViews('1', chatId, storage);
    expect(readView(key, parseReadingPosition, storage)).toBeNull();
    expect(readView(pointer, parseConversationId, storage)).toBeNull();
    expect(readView(privateViewKey('2', 'last-chat'), parseConversationId, storage)).toBe(chatId);
  });
  it('限制本地恢复记录总量', () => {
    const storage = memoryStorage();
    for (let i = 0; i < 90; i++) writeView('test:' + i, position, storage, i + 1);
    expect(storage.length).toBe(80);
    expect(readView('test:0', parsePagePosition, storage, 100)).toBeNull();
    expect(readView('test:89', parsePagePosition, storage, 100)).toEqual(position);
  });
});
