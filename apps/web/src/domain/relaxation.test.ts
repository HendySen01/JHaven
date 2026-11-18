import { expect, it, vi } from 'vitest';
import { BUILTIN_PRESETS } from './audio';
import { createPracticeClock } from './practice-clock';
import { recommendPractice } from './relaxation';

it('将睡前状态映射到固定练习，暂无睡意默认安静', () => {
  expect(recommendPractice('busy', null)).toMatchObject({ practice: 'thoughts', scene: 'rain' });
  expect(recommendPractice('noisy', null)).toMatchObject({ practice: 'body', scene: 'steady' });
  expect(recommendPractice('quiet', null)).toMatchObject({
    practice: 'breathing',
    scene: 'breeze',
  });
  expect(recommendPractice('awake', null)).toMatchObject({ practice: 'unwind', scene: null });
  expect(recommendPractice(null, null)).toMatchObject({ practice: 'unwind', scene: null });
});
it('主动保存的声音优先，只覆盖声音建议', () => {
  const saved = BUILTIN_PRESETS.find((preset) => preset.id === 'coast')!;
  expect(recommendPractice('busy', saved)).toMatchObject({
    practice: 'thoughts',
    scene: 'coast',
    saved,
  });
  expect(recommendPractice('awake', saved)).toMatchObject({ practice: 'unwind', scene: 'coast' });
});
it('步骤时钟以单调时间计时，重复继续与暂停不会多计时', () => {
  let now = 0;
  const clock = createPracticeClock(vi.fn(() => now));
  clock.resume();
  now += 700;
  clock.resume();
  clock.pause();
  clock.pause();
  now += 15000;
  expect(clock.elapsed()).toBe(700);
  clock.resume();
  now += 2300;
  expect(clock.elapsed()).toBe(3000);
  clock.reset();
  expect(clock.elapsed()).toBe(0);
});
