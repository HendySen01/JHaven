import { describe, it, expect } from 'vitest';
import { journalHour, shiftDate, wallTimeCandidates } from './journal';

describe('日记日历及作息偏移', () => {
  it('跨午夜显示次日时间，缺失保留 null', () => {
    expect(journalHour('2026-11-12', '2026-11-12T15:30:00Z', 'Asia/Macau')).toBe(23.5);
    expect(journalHour('2026-11-12', '2026-11-12T23:00:00Z', 'Asia/Macau')).toBe(31);
    expect(journalHour('2026-11-12', null, 'Asia/Macau')).toBeNull();
    expect(shiftDate('2026-01-01', -6)).toBe('2025-12-26');
  });
  it('保留夏令时重叠选项，并拒绝不存在的时刻', () => {
    expect(wallTimeCandidates('2026-11-01T01:30', 'America/New_York')).toEqual([
      '2026-11-01T05:30:00Z',
      '2026-11-01T06:30:00Z',
    ]);
    expect(wallTimeCandidates('2026-03-08T02:30', 'America/New_York')).toEqual([]);
    expect(wallTimeCandidates('2026-11-13T07:00', 'Asia/Macau')).toEqual(['2026-11-12T23:00:00Z']);
  });
});
