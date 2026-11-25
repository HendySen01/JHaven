import { TRACK_IDS, TRACKS } from '@jhaven/shared';
export { TRACK_IDS, TRACKS };
export type { TrackId } from '@jhaven/shared';
import type { TrackId } from '@jhaven/shared';
// 单轨保留原设计的最大增益，混音预算由实际发声轨共同分配。
export const TRACK_GAIN_LIMIT = 0.3;
export const MIX_GAIN_BUDGET = 0.8;
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
