import { TRACK_IDS, TRACKS } from '@jhaven/shared';
export { TRACK_IDS, TRACKS };
export type { TrackId } from '@jhaven/shared';
import type { TrackId } from '@jhaven/shared';
export const localTrackIds = TRACK_IDS.filter((id) => 'localOnly' in TRACKS[id]);
export const availableTrackIds = TRACK_IDS.filter((id) => !localTrackIds.includes(id));
export async function loadLocalTracks() {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return;
  try {
    const response = await fetch('/audio/local-library.json', {
      cache: 'no-store',
      signal: AbortSignal.timeout(1200),
    });
    if (!response.ok || !response.headers.get('Content-Type')?.includes('application/json')) return;
    const ids: unknown = await response.json();
    if (Array.isArray(ids))
      availableTrackIds.push(...localTrackIds.filter((id) => ids.includes(id)));
  } catch {
    // 没有本机试听资源时，仍可正常使用公开声库。
  }
}
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
