import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './AudioEngine';
import { AudioTimer } from './AudioTimer';
import { GainEnvelope } from './GainEnvelope';
import { BUILTIN_PRESETS, copyMix, defaultAudio, volumeToGain } from '../../domain/audio';

// 受控 Web Audio Mock 验证控制流与节点生命周期，不能代表真实浏览器音频渲染。
function createContext(now: () => number) {
  const parameter = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  });
  const gains: ReturnType<typeof gain>[] = [];
  function gain() {
    return { gain: parameter(), connect: vi.fn(), disconnect: vi.fn() };
  }
  const sources: ReturnType<typeof source>[] = [];
  function source() {
    return {
      buffer: null,
      loop: false,
      onended: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }
  const context = {
    get currentTime() {
      return now() / 1000;
    },
    state: 'suspended',
    destination: {},
    onstatechange: null as (() => void) | null,
    resume: vi.fn(async () => {
      context.state = 'running';
      context.onstatechange?.();
    }),
    close: vi.fn(async () => {
      context.state = 'closed';
    }),
    createGain: vi.fn(() => {
      const node = gain();
      gains.push(node);
      return node;
    }),
    createBufferSource: vi.fn(() => {
      const node = source();
      sources.push(node);
      return node;
    }),
    decodeAudioData: vi.fn(async () => ({ duration: 21 })),
  };
  return { context, gains, sources, parameter };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const engines: AudioEngine[] = [];
let now = 0;
function setup(
  fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(new Uint8Array(100))),
) {
  const fake = createContext(() => now);
  const factory = vi.fn(() => fake.context as unknown as AudioContext);
  const engine = new AudioEngine({ contextFactory: factory, fetcher, now: () => now });
  engines.push(engine);
  return { engine, fake, factory, fetcher };
}
beforeEach(() => {
  vi.useFakeTimers();
  now = 0;
});
afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.dispose()));
  vi.useRealTimers();
});

describe('音量与单调计时', () => {
  it.each([
    [-20, 0],
    [0, 0],
    [50, 0.25],
    [100, 1],
    [200, 1],
    [NaN, 0],
    [Infinity, 0],
  ])('音量 %s 转为受限增益', (input, expected) => {
    expect(volumeToGain(input)).toBe(expected);
  });
  it('定时按实际经过时间计算，暂停与取消不累积回调误差', () => {
    const timer = new AudioTimer(() => now);
    timer.configure(120);
    timer.resume();
    now = 35_000;
    expect(timer.snapshot().remaining).toBe(85);
    timer.pause();
    now = 999_000;
    expect(timer.snapshot().remaining).toBe(85);
    timer.resume();
    now += 45_000;
    expect(timer.snapshot().remaining).toBe(40);
    timer.cancel();
    expect(timer.snapshot()).toEqual({ duration: 0, remaining: 0, running: false });
  });
  it('短定时也会淡入可听增益，取消渐弱后恢复而不受旧包络影响', () => {
    const fake = createContext(() => now);
    const param = fake.parameter();
    const envelope = new GainEnvelope(
      fake.context as unknown as BaseAudioContext,
      param as unknown as AudioParam,
      0,
    );
    envelope.scheduleTimer(6, 6);
    now = 1000;
    expect(envelope.valueAt()).toBeGreaterThan(0.7);
    now = 3000;
    expect(envelope.valueAt()).toBeLessThan(0.6);
    envelope.rampTo(1, 0.1);
    now = 7000;
    expect(envelope.valueAt()).toBe(1);
    expect(param.cancelScheduledValues).toHaveBeenCalledTimes(2);
  });
});

describe('引擎状态、并发和资源', () => {
  it('定时与渐弱边界校验不破坏已有定时', async () => {
    const { engine } = setup();
    await engine.play();
    engine.setTimer(30, 15);
    for (const value of [-1, 5, 10801, NaN, Infinity])
      expect(() => engine.setTimer(value)).toThrow();
    expect(() => engine.setTimer(30, 0)).toThrow();
    expect(engine.snapshot().timer.duration).toBe(30);
  });
  it('挂起的 resume 请求有超时，迟到结果不能产生 voice', async () => {
    const deferredResume = deferred<void>();
    const { engine, fake } = setup();
    fake.context.resume.mockReturnValue(deferredResume.promise);
    const started = engine.play();
    await vi.advanceTimersByTimeAsync(4100);
    await started;
    expect(engine.snapshot().status).toBe('error');
    deferredResume.resolve();
    await settle();
    expect(fake.sources).toHaveLength(0);
  });
  it('浏览器尚未恢复时切换混音，仍等待同一个用户手势', async () => {
    const { engine, fake } = setup();
    const resumed = deferred<void>();
    fake.context.resume.mockReturnValue(resumed.promise);
    const started = engine.play();
    const mix = defaultAudio().mix;
    mix.rain.enabled = false;
    mix.ocean.enabled = true;
    engine.applyMix(mix);
    await settle();
    expect(engine.snapshot().status).toBe('loading');
    fake.context.state = 'running';
    resumed.resolve();
    await started;
    await engine.play();
    expect(fake.context.resume).toHaveBeenCalledTimes(1);
    expect(engine.snapshot().tracks.ocean.active).toBe(true);
    expect(engine.snapshot().tracks.rain.active).toBe(false);
  });
  it('下载长时间无响应时中断并进入可重试错误', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        (_input, init) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
          ),
      );
    const { engine } = setup(fetcher);
    const started = engine.play();
    await settle();
    await vi.advanceTimersByTimeAsync(15_100);
    await started;
    expect(engine.snapshot().status).toBe('error');
    expect(engine.snapshot().tracks.rain.active).toBe(false);
  });
  it('快速取消与重新选中复用不可中断的进行中解码', async () => {
    const data = deferred<{ duration: number }>();
    const { engine, fake } = setup();
    fake.context.decodeAudioData.mockReturnValue(data.promise);
    const initial = engine.play();
    await settle();
    engine.applyMix(BUILTIN_PRESETS[2]!.mix);
    engine.applyMix(BUILTIN_PRESETS[0]!.mix);
    data.resolve({ duration: 21 });
    await initial;
    await settle();
    expect(engine.snapshot().status).toBe('playing');
    expect(fake.context.decodeAudioData).toHaveBeenCalledTimes(2);
  });
  it('解码长时间不结束时退出加载，迟到结果不能开声，仍可重试', async () => {
    const data = deferred<{ duration: number }>();
    const { engine, fake } = setup();
    fake.context.decodeAudioData.mockReturnValue(data.promise);
    const started = engine.play();
    await settle();
    await vi.advanceTimersByTimeAsync(15_100);
    await started;
    expect(engine.snapshot().status).toBe('error');
    data.resolve({ duration: 21 });
    await settle();
    expect(fake.sources).toHaveLength(0);
    fake.context.decodeAudioData.mockResolvedValue({ duration: 21 });
    await engine.play();
    expect(engine.snapshot().status).toBe('playing');
  });
  it('解码途中 dispose 会清理定时器，迟到结果不可再次通知或播放', async () => {
    const data = deferred<{ duration: number }>();
    const { engine, fake } = setup();
    fake.context.decodeAudioData.mockReturnValue(data.promise);
    const playing = engine.play();
    await settle();
    await engine.dispose();
    expect(vi.getTimerCount()).toBe(0);
    data.resolve({ duration: 21 });
    await playing;
    expect(engine.snapshot().status).toBe('idle');
    expect(fake.sources).toHaveLength(0);
  });
  it('手势内先 resume 再加载；重复播放共用任务和单一 Context', async () => {
    const pending = deferred<Response>();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() => pending.promise.then((response) => response.clone()));
    const { engine, factory, fake } = setup(fetcher);
    const first = engine.play();
    const second = engine.play();
    expect(second).toBe(first);
    expect(fake.context.resume).toHaveBeenCalledTimes(1);
    expect(engine.snapshot().status).toBe('loading');
    pending.resolve(new Response(new Uint8Array(100)));
    await first;
    expect(engine.snapshot().status).toBe('playing');
    expect(factory).toHaveBeenCalledTimes(1);
    await engine.play();
    expect(fake.sources).toHaveLength(2);
    expect(
      fake.sources.every((source) => source.loop && source.start.mock.calls.length === 1),
    ).toBe(true);
  });
  it('暂停后继续复用 buffer，停止后重新开始无重叠实例', async () => {
    const { engine, fake } = setup();
    await engine.play();
    engine.pause();
    expect(engine.snapshot().status).toBe('stopping');
    await vi.advanceTimersByTimeAsync(160);
    expect(engine.snapshot().status).toBe('paused');
    expect(engine.snapshot().tracks.rain.active).toBe(false);
    await engine.play();
    expect(fake.context.decodeAudioData).toHaveBeenCalledTimes(2);
    engine.stop(0);
    expect(engine.snapshot().status).toBe('idle');
    await engine.play();
    expect(fake.context.decodeAudioData).toHaveBeenCalledTimes(2);
    expect(fake.sources.filter((source) => source.stop.mock.calls.length === 0)).toHaveLength(2);
  });
  it('停止加载中的请求，迟到的解码不能启动声音', async () => {
    const data = deferred<{ duration: number }>();
    const { engine, fake } = setup();
    fake.context.decodeAudioData.mockReturnValue(data.promise);
    const playback = engine.play();
    await settle();
    engine.stop(0);
    data.resolve({ duration: 21 });
    await playback;
    expect(engine.snapshot().status).toBe('idle');
    expect(fake.sources).toHaveLength(0);
  });
  it('快速切换与独立音量更新以最后配置为准，每轨至多一条 voice', async () => {
    const { engine, fake } = setup();
    await engine.play();
    engine.applyMix(BUILTIN_PRESETS[1]!.mix);
    engine.applyMix(BUILTIN_PRESETS[2]!.mix);
    await settle();
    await vi.advanceTimersByTimeAsync(250);
    expect(engine.snapshot().tracks.rain.active).toBe(false);
    expect(engine.snapshot().tracks.wind.active).toBe(true);
    const count = fake.sources.length;
    const mix = copyMix(BUILTIN_PRESETS[2]!.mix);
    mix.wind.volume = 35;
    engine.applyMix(mix);
    await settle();
    expect(fake.sources).toHaveLength(count);
    expect(engine.snapshot().tracks.wind.volume).toBe(35);
  });
  it('浏览器拒绝 resume 时不误报 playing，并允许重试', async () => {
    const { engine, fake } = setup();
    fake.context.resume.mockRejectedValueOnce(new Error('NotAllowedError'));
    await engine.play();
    expect(engine.snapshot().status).toBe('error');
    expect(fake.sources).toHaveLength(0);
    await engine.play();
    expect(engine.snapshot().status).toBe('playing');
  });
  it.each(['network', 'decode'])('%s 失败被展示并可恢复', async (kind) => {
    const { engine, fake, fetcher } = setup();
    if (kind === 'network') fetcher.mockRejectedValueOnce(new Error('network'));
    else fake.context.decodeAudioData.mockRejectedValueOnce(new Error('decode'));
    await engine.play();
    expect(engine.snapshot().status).toBe('error');
    expect(engine.snapshot().error).toContain('重试');
    expect(fake.sources).toHaveLength(0);
    await engine.play();
    expect(engine.snapshot().status).toBe('playing');
  });
  it('挂起后进入暂停，系统自行恢复也不自行启动', async () => {
    const { engine, fake } = setup();
    await engine.play();
    engine.setTimer(60, 15);
    now = 10_000;
    fake.context.state = 'suspended';
    fake.context.onstatechange?.();
    expect(engine.snapshot().status).toBe('paused');
    expect(engine.snapshot().timer.running).toBe(false);
    fake.context.state = 'running';
    fake.context.onstatechange?.();
    expect(engine.snapshot().status).toBe('paused');
    await engine.play();
    expect(engine.snapshot().status).toBe('playing');
    expect(engine.snapshot().timer.remaining).toBe(50);
  });
  it('后台定时已经到期时，稍后收到挂起事件仍结算为停止', async () => {
    const { engine, fake } = setup();
    await engine.play();
    engine.setTimer(10, 5);
    now = 11_000;
    fake.context.state = 'suspended';
    fake.context.onstatechange?.();
    expect(engine.snapshot()).toMatchObject({
      status: 'idle',
      timer: { duration: 0, running: false },
      notice: '定时已结束，声音已停止。',
    });
    expect(engine.snapshot().tracks.rain.active).toBe(false);
  });
  it('旧停止回调与渐弱不能中断重新播放', async () => {
    const { engine } = setup();
    await engine.play();
    engine.stop();
    await engine.play();
    await vi.advanceTimersByTimeAsync(500);
    expect(engine.snapshot().status).toBe('playing');
    expect(engine.snapshot().tracks.rain.active).toBe(true);
  });
  it('后台不 tick 也按单调时间到期，之后清理并重置状态', async () => {
    const { engine } = setup();
    await engine.play();
    engine.setTimer(10, 5);
    now = 100_000;
    engine.tick();
    expect(engine.snapshot().status).toBe('idle');
    expect(engine.snapshot().tracks.rain.active).toBe(false);
    expect(engine.snapshot().timer.duration).toBe(0);
  });
  it('计时暂停在切换预设后保持，取消/重设可恢复', async () => {
    const { engine } = setup();
    await engine.play();
    engine.setTimer(30, 15);
    now = 20_000;
    engine.pauseTimer();
    engine.applyMix(BUILTIN_PRESETS[2]!.mix);
    await settle();
    now += 20_000;
    expect(engine.snapshot().timer.remaining).toBe(10);
    expect(engine.snapshot().timer.running).toBe(false);
    engine.resumeTimer();
    now += 2000;
    expect(engine.snapshot().timer.remaining).toBe(8);
    engine.resetTimer();
    expect(engine.snapshot().timer.remaining).toBe(30);
    engine.setTimer(0, 15);
    expect(engine.snapshot().timer.duration).toBe(0);
    expect(engine.snapshot().status).toBe('playing');
  });
  it('dispose 可重复，断开节点/关闭 Context，所有迟到工作无效', async () => {
    const { engine, fake } = setup();
    await engine.play();
    expect(engine.snapshot().status).toBe('playing');
    expect(fake.sources).toHaveLength(2);
    await engine.dispose();
    await engine.dispose();
    await engine.play();
    expect(fake.context.close).toHaveBeenCalledTimes(1);
    expect(fake.gains.every((gain) => gain.disconnect.mock.calls.length > 0)).toBe(true);
    expect(
      fake.sources.every(
        (source) =>
          source.stop.mock.calls.length === 1 && source.disconnect.mock.calls.length === 1,
      ),
    ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
