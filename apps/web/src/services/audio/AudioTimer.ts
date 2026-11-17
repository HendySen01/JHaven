import type { TimerSnapshot } from '../../types/audio';

export class AudioTimer {
  private duration = 0;
  private remaining = 0;
  private startedAt: number | null = null;
  constructor(private readonly now = () => performance.now()) {}
  snapshot(): TimerSnapshot {
    return {
      duration: this.duration,
      remaining: Math.max(
        0,
        this.remaining - (this.startedAt === null ? 0 : (this.now() - this.startedAt) / 1000),
      ),
      running: this.startedAt !== null,
    };
  }
  configure(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('定时长度无效');
    this.duration = seconds;
    this.remaining = seconds;
    this.startedAt = null;
  }
  resume() {
    if (this.duration > 0 && this.remaining > 0 && this.startedAt === null)
      this.startedAt = this.now();
  }
  pause() {
    this.remaining = this.snapshot().remaining;
    this.startedAt = null;
  }
  cancel() {
    this.configure(0);
  }
}
