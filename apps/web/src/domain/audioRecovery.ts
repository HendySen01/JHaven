import { parseMix } from './audio';
import { TRACK_IDS, type AudioMix } from '../types/audio';

export const AUDIO_RECOVERY_KEY = 'jhaven.audio.session.v1';
const MAX_AGE = 12 * 60 * 60 * 1000;
export interface AudioRecovery {
  version: 1;
  savedAt: number;
  mix: AudioMix;
  masterVolume: number;
  duration: number;
  remaining: number;
  deadline: number | null;
  fade: number;
  timerPaused: boolean;
}

export function recoveryRemaining(session: AudioRecovery, now = Date.now()) {
  return session.deadline === null
    ? session.remaining
    : Math.max(0, Math.min(session.remaining, (session.deadline - now) / 1000));
}

export function parseAudioRecovery(raw: string | null, now = Date.now()): AudioRecovery | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as AudioRecovery;
    if (
      !value ||
      value.version !== 1 ||
      !Number.isFinite(value.savedAt) ||
      value.savedAt > now ||
      now - value.savedAt > MAX_AGE ||
      !Number.isFinite(value.masterVolume) ||
      value.masterVolume < 0 ||
      value.masterVolume > 100 ||
      !Number.isFinite(value.duration) ||
      value.duration < 0 ||
      value.duration > 10800 ||
      (value.duration > 0 && value.duration < 6) ||
      !Number.isFinite(value.remaining) ||
      value.remaining < 0 ||
      value.remaining > value.duration ||
      !Number.isFinite(value.fade) ||
      value.fade < 1 ||
      value.fade > 120 ||
      typeof value.timerPaused !== 'boolean' ||
      (value.deadline !== null &&
        (!Number.isFinite(value.deadline) ||
          value.deadline > value.savedAt + value.duration * 1000 + 1000 ||
          value.timerPaused)) ||
      (value.duration === 0 && (value.deadline !== null || value.timerPaused)) ||
      (value.duration > 0 && recoveryRemaining(value, now) <= 0)
    )
      return null;
    const mix = parseMix(value.mix);
    if (!TRACK_IDS.some((id) => mix[id].enabled)) return null;
    return {
      version: 1,
      savedAt: value.savedAt,
      mix,
      masterVolume: value.masterVolume,
      duration: value.duration,
      remaining: value.remaining,
      deadline: value.deadline,
      fade: value.fade,
      timerPaused: value.timerPaused,
    };
  } catch {
    return null;
  }
}

// 播放中的每次 UI tick 不需要写盘。绝对截止时间微小的时钟偏差不算变化。
export function sameAudioRecovery(a: AudioRecovery, b: AudioRecovery) {
  return (
    a.masterVolume === b.masterVolume &&
    a.duration === b.duration &&
    a.fade === b.fade &&
    a.timerPaused === b.timerPaused &&
    JSON.stringify(a.mix) === JSON.stringify(b.mix) &&
    (a.deadline !== null && b.deadline !== null
      ? Math.abs(a.deadline - b.deadline) < 1000
      : a.deadline === b.deadline && a.remaining === b.remaining)
  );
}
