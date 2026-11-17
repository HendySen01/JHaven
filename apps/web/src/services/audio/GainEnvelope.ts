interface Ramp {
  start: number;
  end: number;
  from: number;
  to: number;
}
// 自行保存线性包络，兼容缺少 cancelAndHoldAtTime 的浏览器，并可取消旧的渐弱。
export class GainEnvelope {
  private ramps: Ramp[] = [];
  private initial: number;
  constructor(
    private readonly context: BaseAudioContext,
    private readonly param: AudioParam,
    initial = 1,
  ) {
    this.initial = initial;
    param.setValueAtTime(initial, context.currentTime);
  }
  valueAt(time = this.context.currentTime) {
    let value = this.initial;
    for (const ramp of this.ramps) {
      if (time < ramp.start) break;
      value =
        time >= ramp.end
          ? ramp.to
          : ramp.from +
            ((ramp.to - ramp.from) * (time - ramp.start)) /
              Math.max(0.00001, ramp.end - ramp.start);
    }
    return Math.max(0, Math.min(1, value));
  }
  private hold() {
    const now = this.context.currentTime;
    const current = this.valueAt(now);
    this.param.cancelScheduledValues(now);
    this.param.setValueAtTime(current, now);
    this.initial = current;
    this.ramps = [];
    return { now, current };
  }
  rampTo(target: number, seconds = 0.12) {
    const { now, current } = this.hold();
    const value = Math.min(1, Math.max(0, Number.isFinite(target) ? target : 0));
    if (seconds <= 0) {
      this.param.setValueAtTime(value, now);
      this.initial = value;
      return;
    }
    this.param.linearRampToValueAtTime(value, now + seconds);
    this.ramps.push({ start: now, end: now + seconds, from: current, to: value });
  }
  scheduleTimer(remaining: number, fade: number) {
    const { now, current } = this.hold();
    const hold = Math.max(0, remaining - fade);
    const bridge = Math.min(0.1, remaining / 4);
    const target = hold > bridge ? 1 : Math.min(1, remaining / Math.max(0.001, fade));
    this.param.linearRampToValueAtTime(target, now + bridge);
    this.ramps.push({ start: now, end: now + bridge, from: current, to: target });
    if (hold > bridge) {
      this.param.setValueAtTime(target, now + hold);
      this.ramps.push({ start: now + bridge, end: now + hold, from: target, to: target });
    }
    this.param.linearRampToValueAtTime(0, now + Math.max(0.001, remaining));
    this.ramps.push({
      start: now + Math.max(hold, bridge),
      end: now + Math.max(0.001, remaining),
      from: target,
      to: 0,
    });
  }
}
