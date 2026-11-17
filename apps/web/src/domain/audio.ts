import { TRACK_IDS, type AudioMix, type SoundPreset } from '../types/audio';

export function clampVolume(value: number) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}
// 为三轨最大音量预留混音余量；不是医学或响度校准参数。
export function volumeToGain(value: number, headroom = 1) {
  return (clampVolume(value) / 100) ** 2 * headroom;
}
export function copyMix(mix: AudioMix): AudioMix {
  return { rain: { ...mix.rain }, ocean: { ...mix.ocean }, wind: { ...mix.wind } };
}
export const BUILTIN_PRESETS: SoundPreset[] = [
  {
    id: 'rain',
    name: '雨夜',
    mix: {
      rain: { enabled: true, volume: 65 },
      ocean: { enabled: false, volume: 40 },
      wind: { enabled: true, volume: 20 },
    },
  },
  {
    id: 'coast',
    name: '静谧海岸',
    mix: {
      rain: { enabled: false, volume: 40 },
      ocean: { enabled: true, volume: 65 },
      wind: { enabled: true, volume: 25 },
    },
  },
  {
    id: 'breeze',
    name: '微风',
    mix: {
      rain: { enabled: false, volume: 40 },
      ocean: { enabled: false, volume: 40 },
      wind: { enabled: true, volume: 60 },
    },
  },
];
export function parseMix(value: unknown): AudioMix {
  if (typeof value !== 'object' || value === null) throw new Error('混音格式无效');
  const result = {} as AudioMix;
  for (const id of TRACK_IDS) {
    const item: unknown = (value as Record<string, unknown>)[id];
    if (
      typeof item !== 'object' ||
      item === null ||
      !('enabled' in item) ||
      typeof item.enabled !== 'boolean' ||
      !('volume' in item) ||
      typeof item.volume !== 'number' ||
      !Number.isFinite(item.volume) ||
      item.volume < 0 ||
      item.volume > 100
    )
      throw new Error('音轨配置无效');
    result[id] = { enabled: item.enabled, volume: item.volume };
  }
  return result;
}
export const AUDIO_STORAGE_KEY = 'jhaven.audio.v1';
export interface SavedAudio {
  version: 1;
  mix: AudioMix;
  masterVolume: number;
  presets: SoundPreset[];
  currentPresetId: string | null;
}
export function defaultAudio(): SavedAudio {
  return {
    version: 1,
    mix: copyMix(BUILTIN_PRESETS[0]!.mix),
    masterVolume: 60,
    presets: [],
    currentPresetId: 'rain',
  };
}
export function parseSavedAudio(raw: string | null): SavedAudio {
  if (raw === null) return defaultAudio();
  const value: unknown = JSON.parse(raw);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    value.version !== 1 ||
    !('mix' in value) ||
    !('masterVolume' in value) ||
    typeof value.masterVolume !== 'number' ||
    !Number.isFinite(value.masterVolume) ||
    value.masterVolume < 0 ||
    value.masterVolume > 100 ||
    !('presets' in value) ||
    !Array.isArray(value.presets) ||
    value.presets.length > 20
  )
    throw new Error('播放偏好格式无效');
  const ids = new Set<string>();
  const presets = value.presets.map((preset: unknown): SoundPreset => {
    if (
      typeof preset !== 'object' ||
      preset === null ||
      !('id' in preset) ||
      typeof preset.id !== 'string' ||
      !/^custom-[a-zA-Z0-9-]{1,64}$/.test(preset.id) ||
      ids.has(preset.id) ||
      !('name' in preset) ||
      typeof preset.name !== 'string' ||
      !preset.name.trim() ||
      preset.name.trim().length > 40 ||
      !('mix' in preset)
    )
      throw new Error('自定义场景格式无效');
    ids.add(preset.id);
    const mix = parseMix(preset.mix);
    if (!TRACK_IDS.some((id) => mix[id].enabled)) throw new Error('场景至少需要一个音轨');
    return { id: preset.id, name: preset.name.trim(), mix };
  });
  const currentPresetId =
    'currentPresetId' in value &&
    typeof value.currentPresetId === 'string' &&
    value.currentPresetId.length <= 80
      ? value.currentPresetId
      : null;
  return {
    version: 1,
    mix: parseMix(value.mix),
    masterVolume: value.masterVolume,
    presets,
    currentPresetId,
  };
}
