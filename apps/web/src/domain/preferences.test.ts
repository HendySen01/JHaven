import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_KEY,
  parsePreferences,
  readPreferences,
  savePreferences,
} from './preferences';

describe('界面偏好的边界与隐私', () => {
  it('首次访问使用默认值', () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
  });
  it('只保留界面字段', () => {
    expect(
      parsePreferences(
        JSON.stringify({ ...DEFAULT_PREFERENCES, palette: 'moonlight', note: '不应保留' }),
      ),
    ).toEqual({ ...DEFAULT_PREFERENCES, palette: 'moonlight' });
  });
  it.each([
    '{broken',
    'null',
    '{}',
    '{"version":2}',
    JSON.stringify({ ...DEFAULT_PREFERENCES, reduceMotion: 'false' }),
    JSON.stringify({ ...DEFAULT_PREFERENCES, palette: 'invalid' }),
  ])('损坏或不兼容的偏好 %j 安全回退', (raw) => {
    const result = readPreferences({ getItem: () => raw, setItem: vi.fn() });
    expect(result).toEqual({ preferences: DEFAULT_PREFERENCES, error: true });
  });
  it('存储读取被拒绝时保持可用', () => {
    const result = readPreferences({
      getItem: () => {
        throw new Error('denied');
      },
      setItem: vi.fn(),
    });
    expect(result.error).toBe(true);
    expect(result.preferences).toEqual(DEFAULT_PREFERENCES);
  });
  it('写入被拒绝时返回失败，不冒充已保存', () => {
    expect(
      savePreferences(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error('quota');
          },
        },
        DEFAULT_PREFERENCES,
      ),
    ).toBe(false);
  });
  it('仅写入有版本的界面偏好键', () => {
    const setItem = vi.fn();
    expect(savePreferences({ getItem: () => null, setItem }, DEFAULT_PREFERENCES)).toBe(true);
    expect(setItem).toHaveBeenCalledWith(PREFERENCES_KEY, JSON.stringify(DEFAULT_PREFERENCES));
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});
