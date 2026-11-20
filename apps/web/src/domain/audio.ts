import { TRACK_IDS, type AudioMix, type SoundPreset, type TrackId } from '../types/audio';

export const trackNotes: Partial<Record<TrackId, { aliases: string[]; description: string }>> = {
  fan: { aliases: ['电扇'], description: '桌面风扇平稳转动时的风声。' },
  'soft-chew': {
    aliases: ['柔和颗粒声', '咀嚼声', 'chewing'],
    description: '近距离录下的咀嚼声，保留了轻重变化。',
  },
  'crunchy-chew': { aliases: ['咬脆片'], description: '清楚的咬合声和轻碎响。' },
  'mouth-asmr': { aliases: ['口腔声'], description: '近距离的口腔细响。' },
  'lego-rustle': { aliases: ['LEGO', '乐高'], description: '积木翻动时的碰撞和摩擦。' },
  'leaf-steps': {
    aliases: ['枯叶', '脚步'],
    description: '脚步踩过落叶时的起伏碎响。',
  },
  'gentle-crinkle': {
    aliases: ['轻脆捏捏声', '脆皮捏捏', 'crispy squishy', 'wax cracking'],
    description: '原名「轻脆捏捏声」。当前为合成碎响，脆皮捏捏实录待寻找。',
  },
};

export function clampVolume(value: number) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}
export function volumeToGain(value: number, headroom = 1) {
  return (clampVolume(value) / 100) ** 2 * headroom;
}
const legacyTrackIds = new Set<TrackId>(['rain', 'ocean', 'wind']);
export function copyMix(mix: Partial<AudioMix>): AudioMix {
  return Object.fromEntries(
    TRACK_IDS.map((id) => [id, { enabled: false, volume: 40, ...mix[id] }]),
  ) as AudioMix;
}
export function singleTrackMix(id: TrackId, volume = 45) {
  return copyMix({ [id]: { enabled: true, volume } });
}
export const BUILTIN_PRESETS: SoundPreset[] = [
  {
    id: 'rain',
    name: '雨夜',
    mix: copyMix({
      rain: { enabled: true, volume: 65 },
      ocean: { enabled: false, volume: 40 },
      wind: { enabled: true, volume: 20 },
    }),
  },
  {
    id: 'coast',
    name: '静谧海岸',
    mix: copyMix({
      rain: { enabled: false, volume: 40 },
      ocean: { enabled: true, volume: 65 },
      wind: { enabled: true, volume: 25 },
    }),
  },
  {
    id: 'breeze',
    name: '微风',
    mix: copyMix({
      rain: { enabled: false, volume: 40 },
      ocean: { enabled: false, volume: 40 },
      wind: { enabled: true, volume: 60 },
    }),
  },
  { id: 'brook', name: '溪边', mix: singleTrackMix('stream') },
  { id: 'steady', name: '平稳背景', mix: singleTrackMix('pink') },
];
export function parseMix(value: unknown): AudioMix {
  if (typeof value !== 'object' || value === null) throw new Error('混音格式无效');
  const result = copyMix({});
  for (const id of TRACK_IDS) {
    const item: unknown = (value as Record<string, unknown>)[id];
    if (item === undefined && !legacyTrackIds.has(id)) continue;
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
  favorites: TrackId[];
}
export function defaultAudio(): SavedAudio {
  return {
    version: 1,
    mix: copyMix(BUILTIN_PRESETS[0]!.mix),
    masterVolume: 45,
    presets: [],
    currentPresetId: 'rain',
    favorites: [],
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
  const favorites = 'favorites' in value && Array.isArray(value.favorites) ? value.favorites : [];
  return {
    version: 1,
    mix: parseMix(value.mix),
    masterVolume: value.masterVolume,
    presets,
    currentPresetId,
    favorites: TRACK_IDS.filter((id) => favorites.includes(id)),
  };
}
