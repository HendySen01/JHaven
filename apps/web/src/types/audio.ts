import catalog from '../domain/sound-catalog.json';

export type TrackId = keyof typeof catalog;
export const TRACK_IDS = Object.keys(catalog) as TrackId[];
export const TRACKS = catalog;
// 即使所有音轨在切换过程中短暂重叠，源峰值不超过 0.66 时仍保留输出余量。
export const TRACK_GAIN_LIMIT = Math.min(0.3, 0.9 / (TRACK_IDS.length * 0.66));
export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'stopping' | 'error';
export type TrackLoadStatus = 'idle' | 'loading' | 'ready' | 'error';
export interface TrackConfig {
  enabled: boolean;
  volume: number;
}
export type AudioMix = Record<TrackId, TrackConfig>;
export interface TrackSnapshot extends TrackConfig {
  loadStatus: TrackLoadStatus;
  active: boolean;
  error: string | null;
}
export interface TimerSnapshot {
  duration: number;
  remaining: number;
  running: boolean;
}
export interface AudioSnapshot {
  status: PlaybackStatus;
  tracks: Record<TrackId, TrackSnapshot>;
  masterVolume: number;
  timer: TimerSnapshot;
  fadeSeconds: number;
  fading: boolean;
  error: string | null;
  notice: string;
}
export interface SoundPreset {
  id: string;
  name: string;
  mix: AudioMix;
}
