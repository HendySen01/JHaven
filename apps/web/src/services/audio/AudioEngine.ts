import { clampVolume, copyMix, defaultAudio, parseMix, volumeToGain } from '../../domain/audio';
import {
  TRACK_IDS,
  TRACKS,
  type AudioMix,
  type AudioSnapshot,
  type PlaybackStatus,
  type TrackId,
} from '../../types/audio';
import { AudioTrack } from './AudioTrack';
import { AudioTimer } from './AudioTimer';
import { GainEnvelope } from './GainEnvelope';

interface EngineOptions {
  contextFactory?: () => AudioContext;
  fetcher?: typeof fetch;
  now?: () => number;
}
export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private fade: GainNode | null = null;
  private masterEnvelope: GainEnvelope | null = null;
  private fadeEnvelope: GainEnvelope | null = null;
  private tracks = new Map<TrackId, AudioTrack>();
  private mix = defaultAudio().mix;
  private status: PlaybackStatus = 'idle';
  private intent: 'idle' | 'playing' | 'paused' = 'idle';
  private masterVolume = 60;
  private fadeSeconds = 15;
  private timerManuallyPaused = false;
  private error: string | null = null;
  private notice = '';
  private revision = 0;
  private disposed = false;
  private transition: ReturnType<typeof setTimeout> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private playTask: Promise<void> | null = null;
  private listeners = new Set<(snapshot: AudioSnapshot) => void>();
  readonly timer: AudioTimer;
  constructor(private readonly options: EngineOptions = {}) {
    this.timer = new AudioTimer(options.now);
  }
  snapshot(): AudioSnapshot {
    const tracks = {} as AudioSnapshot['tracks'];
    for (const id of TRACK_IDS) {
      const track = this.tracks.get(id);
      tracks[id] = {
        ...this.mix[id],
        loadStatus: track?.loadStatus ?? 'idle',
        active: Boolean(track?.source),
        error: track?.error ?? null,
      };
    }
    const timer = this.timer.snapshot();
    return {
      status: this.status,
      tracks,
      masterVolume: this.masterVolume,
      timer,
      fadeSeconds: this.fadeSeconds,
      fading: this.status === 'playing' && timer.running && timer.remaining <= this.fadeSeconds,
      error: this.error,
      notice: this.notice,
    };
  }
  subscribe(listener: (snapshot: AudioSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }
  private emit = () => {
    if (!this.disposed) for (const listener of this.listeners) listener(this.snapshot());
  };
  private initialize() {
    if (this.context && this.context.state !== 'closed') return this.context;
    for (const track of this.tracks.values()) track.dispose();
    this.tracks.clear();
    this.context = this.options.contextFactory ? this.options.contextFactory() : new AudioContext();
    const context = this.context;
    this.master = context.createGain();
    this.fade = context.createGain();
    this.fade.connect(this.master);
    this.master.connect(context.destination);
    this.masterEnvelope = new GainEnvelope(
      context,
      this.master.gain,
      volumeToGain(this.masterVolume),
    );
    this.fadeEnvelope = new GainEnvelope(context, this.fade.gain, 0);
    for (const id of TRACK_IDS)
      this.tracks.set(
        id,
        new AudioTrack(id, TRACKS[id].url, context, this.fade, this.emit, this.options.fetcher),
      );
    context.onstatechange = () => {
      if (this.disposed || this.context !== context || this.intent !== 'playing') return;
      if (context.state !== 'running' && this.status === 'playing') {
        this.revision++;
        this.intent = 'paused';
        this.timer.pause();
        this.cancelTransition();
        for (const track of this.tracks.values()) {
          track.cancelLoad();
          track.releaseVoice();
        }
        this.fadeEnvelope?.rampTo(0, 0);
        this.status = 'paused';
        this.notice = '浏览器暂停了音频。回到页面后，请点击继续播放。';
        this.stopTicker();
        this.emit();
      }
    };
    return context;
  }
  play(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.status === 'loading' || this.status === 'playing')
      return this.playTask ?? Promise.resolve();
    if (!TRACK_IDS.some((id) => this.mix[id].enabled)) {
      this.error = '请先开启至少一条音轨。';
      this.status = 'error';
      this.emit();
      return Promise.resolve();
    }
    this.cancelTransition();
    this.intent = 'playing';
    this.status = 'loading';
    this.error = null;
    this.notice = '';
    const revision = ++this.revision;
    try {
      const context = this.initialize();
      // 必须在按钮的用户手势栈内调用 resume，不能先等网络请求。
      const resume = context.resume();
      this.emit();
      this.playTask = this.reconcile(revision, resume);
    } catch {
      this.fail('当前浏览器无法创建音频，请使用支持 Web Audio 的浏览器重试。');
      this.playTask = Promise.resolve();
    }
    return this.playTask;
  }
  private async reconcile(revision: number, resume?: Promise<void>) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (resume)
        await Promise.race([
          resume,
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => reject(new Error('播放权限请求超时')), 4000);
          }),
        ]);
      if (timeout) clearTimeout(timeout);
      if (revision !== this.revision || this.intent !== 'playing' || this.disposed) return;
      await Promise.all(
        TRACK_IDS.filter((id) => this.mix[id].enabled).map((id) => this.tracks.get(id)!.load()),
      );
      if (revision !== this.revision || this.intent !== 'playing' || this.disposed) return;
      if (this.context?.state !== 'running') throw new Error('浏览器尚未允许声音播放');
      for (const id of TRACK_IDS)
        if (this.mix[id].enabled) this.tracks.get(id)!.start(this.mix[id].volume);
      this.status = 'playing';
      if (!this.timer.snapshot().running) {
        if (!this.timerManuallyPaused) this.timer.resume();
        this.scheduleTimer();
      }
      this.startTicker();
      this.emit();
    } catch {
      if (revision === this.revision && !this.disposed)
        this.fail('播放未能启动：可能是浏览器限制、网络或音频解码失败。请点击重试。');
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  applyMix(value: AudioMix) {
    if (this.disposed) return;
    this.mix = copyMix(parseMix(value));
    this.error = null;
    for (const id of TRACK_IDS) {
      const track = this.tracks.get(id);
      if (!this.mix[id].enabled) track?.fadeOff();
      else if (track?.source) track.setVolume(this.mix[id].volume);
    }
    if (!TRACK_IDS.some((id) => this.mix[id].enabled)) {
      this.stop();
      return;
    }
    if (this.intent === 'playing') {
      const revision = ++this.revision;
      this.status = 'loading';
      this.emit();
      this.playTask = this.reconcile(revision);
    } else {
      if (this.status === 'error') this.status = 'idle';
      this.emit();
    }
  }
  setMasterVolume(value: number) {
    this.masterVolume = clampVolume(value);
    this.masterEnvelope?.rampTo(volumeToGain(this.masterVolume));
    this.emit();
  }
  pause() {
    this.finishWithFade('paused', 0.12);
  }
  stop(seconds = 0.35) {
    this.finishWithFade(
      'idle',
      Math.max(0, Math.min(2, Number.isFinite(seconds) ? seconds : 0.35)),
    );
  }
  private finishWithFade(target: 'idle' | 'paused', seconds: number) {
    if (this.disposed) return;
    const revision = ++this.revision;
    this.intent = target;
    this.cancelTransition();
    if (target === 'idle') {
      this.timer.cancel();
      this.timerManuallyPaused = false;
    } else this.timer.pause();
    this.error = null;
    for (const track of this.tracks.values()) track.cancelLoad();
    const finish = () => {
      if (revision !== this.revision || this.disposed) return;
      this.transition = null;
      for (const track of this.tracks.values()) track.releaseVoice(target === 'idle');
      this.fadeEnvelope?.rampTo(0, 0);
      this.status = target;
      this.stopTicker();
      this.emit();
    };
    if (
      !this.context ||
      ![...this.tracks.values()].some((track) => track.source) ||
      seconds === 0 ||
      this.context.state !== 'running'
    ) {
      finish();
      return;
    }
    this.fadeEnvelope?.rampTo(0, seconds);
    this.status = 'stopping';
    this.emit();
    this.transition = setTimeout(finish, seconds * 1000 + 20);
  }
  setTimer(seconds: number, fadeSeconds = this.fadeSeconds) {
    if (!Number.isFinite(seconds) || (seconds !== 0 && (seconds < 6 || seconds > 10800)))
      throw new Error('定时请填写 0.1–180 分钟。');
    if (!Number.isFinite(fadeSeconds) || fadeSeconds < 1 || fadeSeconds > 120)
      throw new Error('渐弱请设置为 1–120 秒。');
    this.fadeSeconds = fadeSeconds;
    this.timerManuallyPaused = false;
    this.timer.configure(seconds);
    if (this.status === 'playing') this.timer.resume();
    this.scheduleTimer();
    this.notice = seconds
      ? '定时将在播放时计时；暂停声音会暂停计时。刷新页面会取消。'
      : '已取消定时，音量会柔和恢复。';
    this.emit();
  }
  pauseTimer() {
    this.timerManuallyPaused = true;
    this.timer.pause();
    if (this.intent === 'playing') this.fadeEnvelope?.rampTo(1);
    this.emit();
  }
  resumeTimer() {
    if (this.status !== 'playing') return;
    this.timerManuallyPaused = false;
    this.timer.resume();
    this.scheduleTimer();
    this.emit();
  }
  resetTimer() {
    const duration = this.timer.snapshot().duration;
    if (duration) this.setTimer(duration);
  }
  private scheduleTimer() {
    const timer = this.timer.snapshot();
    if (timer.running)
      this.fadeEnvelope?.scheduleTimer(timer.remaining, Math.min(this.fadeSeconds, timer.duration));
    else if (this.intent === 'playing') this.fadeEnvelope?.rampTo(1, 0.2);
  }
  // Interval 只负责界面刷新/清理，剩余时间不依赖回调次数；静音由音频线程自动化执行。
  tick = () => {
    const timer = this.timer.snapshot();
    if (timer.running && timer.remaining <= 0) {
      this.stop(0);
      this.notice = '定时已结束，声音已停止。';
    }
    this.emit();
  };
  private startTicker() {
    if (!this.ticker) this.ticker = setInterval(this.tick, 250);
  }
  private stopTicker() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }
  private cancelTransition() {
    if (this.transition) clearTimeout(this.transition);
    this.transition = null;
  }
  private fail(message: string) {
    this.revision++;
    this.intent = 'paused';
    this.cancelTransition();
    this.stopTicker();
    this.timer.pause();
    for (const track of this.tracks.values()) {
      track.cancelLoad();
      track.releaseVoice();
    }
    this.fadeEnvelope?.rampTo(0, 0);
    this.status = 'error';
    this.error = message;
    this.emit();
  }
  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.status = 'idle';
    this.intent = 'idle';
    this.error = null;
    this.revision++;
    this.cancelTransition();
    this.stopTicker();
    this.timer.cancel();
    for (const track of this.tracks.values()) track.dispose();
    this.tracks.clear();
    this.fade?.disconnect();
    this.master?.disconnect();
    if (this.context) {
      this.context.onstatechange = null;
      if (this.context.state !== 'closed') await this.context.close().catch(() => undefined);
    }
    this.context = null;
    this.listeners.clear();
  }
}
