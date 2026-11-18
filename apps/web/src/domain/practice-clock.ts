// 步骤使用单调时间；用户暂停或离开可见页面时冻结。
export function createPracticeClock(now = () => performance.now()) {
  let elapsed = 0;
  let started: number | null = null;
  return {
    elapsed: () => elapsed + (started === null ? 0 : now() - started),
    resume() {
      started ??= now();
    },
    pause() {
      if (started !== null) elapsed += now() - started;
      started = null;
    },
    reset() {
      elapsed = 0;
      started = null;
    },
  };
}
