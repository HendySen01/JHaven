import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { AUDIO_STORAGE_KEY, BUILTIN_PRESETS, defaultAudio, parseSavedAudio } from './audio';
import { useAudioStore } from '../stores/audio';

afterEach(() => vi.unstubAllGlobals());
describe('声音预设持久化', () => {
  it('从原三轨格式保留配比与自定义场景，并对收藏执行白名单校验', () => {
    const { rain, ocean, wind } = defaultAudio().mix;
    const mix = { rain: { ...rain, volume: 21 }, ocean, wind };
    const loaded = parseSavedAudio(
      JSON.stringify({
        ...defaultAudio(),
        mix,
        favorites: ['pink', 'pink', 'missing'],
        presets: [{ id: 'custom-old', name: '旧场景', mix }],
      }),
    );
    expect(loaded.mix.rain.volume).toBe(21);
    expect(loaded.mix.pink.enabled).toBe(false);
    expect(loaded.presets[0]?.mix.stream.enabled).toBe(false);
    expect(loaded.favorites).toEqual(['pink']);
  });
  it('与内置配比相同的自定义场景仍恢复自己的名称', () => {
    const map = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => map.set(key, value),
    });
    setActivePinia(createPinia());
    const first = useAudioStore();
    first.initialize();
    first.savePreset('我的雨夜');
    setActivePinia(createPinia());
    const second = useAudioStore();
    second.initialize();
    expect(second.currentName).toBe('我的雨夜');
    first.dispose();
    second.dispose();
  });
  it.each([
    'null',
    '{}',
    '{broken',
    JSON.stringify({ ...defaultAudio(), version: 2 }),
    JSON.stringify({ ...defaultAudio(), masterVolume: 101 }),
    JSON.stringify({ ...defaultAudio(), mix: { rain: { volume: -1, enabled: true } } }),
  ])('拒绝损坏/过期数据 %s', (raw) => {
    expect(() => parseSavedAudio(raw)).toThrow();
  });
  it('只保留白名单字段，不读取自动播放或计时状态', () => {
    const saved = parseSavedAudio(
      JSON.stringify({
        ...defaultAudio(),
        playing: true,
        timer: { remaining: 5 },
        token: 'ignored',
      }),
    );
    expect(saved).toEqual(defaultAudio());
  });
  it('自定义场景保存并恢复正确配比，删除真实生效', () => {
    const map = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => map.set(key, value),
    });
    setActivePinia(createPinia());
    const audio = useAudioStore();
    audio.initialize();
    audio.applyPreset(BUILTIN_PRESETS[1]!);
    audio.updateTrack('rain', { enabled: true, volume: 22 });
    expect(audio.savePreset('我的海边雨夜')).toBe(true);
    expect(parseSavedAudio(map.get(AUDIO_STORAGE_KEY)!).presets[0]?.mix.rain.volume).toBe(22);
    setActivePinia(createPinia());
    const restored = useAudioStore();
    restored.initialize();
    expect(restored.currentName).toBe('我的海边雨夜');
    expect(restored.snapshot.status).toBe('idle');
    expect(restored.snapshot.timer.duration).toBe(0);
    restored.deletePreset(restored.presets[0]!.id);
    expect(restored.presets).toHaveLength(0);
    audio.dispose();
    restored.dispose();
  });
  it('名称边界与空混音会拒绝保存', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    setActivePinia(createPinia());
    const audio = useAudioStore();
    audio.initialize();
    expect(audio.savePreset(' ')).toBe(false);
    expect(audio.savePreset('a'.repeat(41))).toBe(false);
    for (const id of ['rain', 'ocean', 'wind'] as const) audio.updateTrack(id, { enabled: false });
    expect(audio.savePreset('空混音')).toBe(false);
    audio.dispose();
  });
  it('存储写入受限时反馈未保存，保留当前可用配置', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('denied');
      },
    });
    setActivePinia(createPinia());
    const audio = useAudioStore();
    audio.initialize();
    expect(audio.savePreset('临时场景')).toBe(false);
    expect(audio.storageMessage).toContain('无法保存');
    expect(audio.presets).toHaveLength(1);
    audio.dispose();
  });
});
