import { describe, expect, it } from 'vitest';
import { defaultAudio, singleTrackMix } from './audio';
import {
  parseAudioRecovery,
  recoveryRemaining,
  sameAudioRecovery,
  type AudioRecovery,
} from './audioRecovery';

const now = 10000000;
const session: AudioRecovery = {
  version: 1,
  savedAt: now,
  mix: defaultAudio().mix,
  masterVolume: 45,
  duration: 1800,
  remaining: 1200,
  deadline: now + 1200000,
  fade: 15,
  timerPaused: false,
};

describe('播放会话恢复', () => {
  it('无定时的单轨和多轨都可恢复，不会因剩余时间为零而过期', () => {
    for (const mix of [singleTrackMix('rain'), session.mix]) {
      const untimed = { ...session, mix, duration: 0, remaining: 0, deadline: null };
      const restored = parseAudioRecovery(JSON.stringify(untimed), now + 3600000);
      expect(restored).toMatchObject({ mix, duration: 0, remaining: 0, deadline: null });
      expect(recoveryRemaining(restored!, now + 3600000)).toBe(0);
    }
  });
  it('运行定时按绝对截止时间扣除离开时间，过期不恢复', () => {
    const restored = parseAudioRecovery(JSON.stringify(session), now + 600000);
    expect(restored).not.toBeNull();
    expect(recoveryRemaining(restored!, now + 600000)).toBe(600);
    expect(parseAudioRecovery(JSON.stringify(session), now + 1200000)).toBeNull();
  });
  it('主动暂停保留剩余时间及独立暂停标志', () => {
    const paused = { ...session, deadline: null, timerPaused: true };
    expect(recoveryRemaining(paused, now + 600000)).toBe(1200);
    expect(parseAudioRecovery(JSON.stringify(paused), now + 600000)?.timerPaused).toBe(true);
  });
  it('拒绝损坏、越界、未知版本或超龄记录', () => {
    for (const bad of [
      '{',
      JSON.stringify({ ...session, version: 2 }),
      JSON.stringify({ ...session, masterVolume: 200 }),
      JSON.stringify({ ...session, remaining: -1 }),
      JSON.stringify({ ...session, deadline: now + 99999999 }),
    ])
      expect(parseAudioRecovery(bad, now)).toBeNull();
    expect(
      parseAudioRecovery(JSON.stringify({ ...session, deadline: null }), now + 43200001),
    ).toBeNull();
  });
  it('定时 tick 不重复写入稳定截止时间，实际音量变化会保存', () => {
    expect(sameAudioRecovery(session, { ...session, savedAt: now + 250, remaining: 1199.75 })).toBe(
      true,
    );
    expect(sameAudioRecovery(session, { ...session, masterVolume: 50 })).toBe(false);
  });
});
