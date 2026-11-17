export const TRACK_IDS = ['rain', 'ocean', 'wind'] as const;
export type TrackId = (typeof TRACK_IDS)[number];
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
export const TRACKS: Record<TrackId, { name: string; url: string; author: string }> = {
  rain: { name: '雨声', url: '/audio/rain.wav', author: 'barkenov' },
  ocean: { name: '海浪', url: '/audio/ocean.wav', author: 'SamsterBirdies' },
  wind: { name: '微风', url: '/audio/wind.wav', author: 'Nox_Sound' },
};
