import { volumeToGain } from '../../domain/audio';
import { TRACK_GAIN_LIMIT, TRACKS } from '../../types/audio';
import type { TrackId, TrackLoadStatus } from '../../types/audio';
import { GainEnvelope } from './GainEnvelope';

export class AudioTrack {
  buffer: AudioBuffer | null = null;
  source: AudioBufferSourceNode | null = null;
  loadStatus: TrackLoadStatus = 'idle';
  error: string | null = null;
  private controller: AbortController | null = null;
  private loading: Promise<void> | null = null;
  private generation = 0;
  private decoding = false;
  private loadTimeout: ReturnType<typeof setTimeout> | null = null;
  private gain: GainNode;
  private envelope: GainEnvelope;
  private cleanup: ReturnType<typeof setTimeout> | null = null;
  private offset = 0;
  private startedAt = 0;
  constructor(
    readonly id: TrackId,
    private readonly url: string,
    private readonly context: AudioContext,
    destination: AudioNode,
    private readonly changed: () => void,
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.gain = context.createGain();
    this.gain.connect(destination);
    this.envelope = new GainEnvelope(context, this.gain.gain, 0);
  }
  load(): Promise<void> {
    if (this.buffer) return Promise.resolve();
    if (this.loading) return this.loading;
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.loadStatus = 'loading';
    this.error = null;
    this.changed();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    this.loadTimeout = timeout;
    this.loading = (async () => {
      try {
        const response = await this.fetcher(this.url, {
          signal: controller.signal,
          credentials: 'same-origin',
        });
        if (!response.ok) throw new Error('下载失败');
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 8 * 1024 * 1024 || bytes.byteLength < 44)
          throw new Error('音频大小无效');
        this.decoding = true;
        // 原生解码无法取消；超时仍须结束等待，迟到的解码结果不再进入缓存或开声。
        const decoded = this.context.decodeAudioData(bytes);
        const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
          const abort = () => reject(new Error('音轨加载超时或已取消'));
          controller.signal.addEventListener('abort', abort, { once: true });
          if (controller.signal.aborted) abort();
          void decoded.then(resolve, reject).finally(() => {
            controller.signal.removeEventListener('abort', abort);
          });
        });
        if (generation !== this.generation) return;
        if (controller.signal.aborted) throw new Error('音轨加载超时');
        if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > 60)
          throw new Error('音频解码结果无效');
        this.buffer = buffer;
        this.loadStatus = 'ready';
      } catch {
        if (generation !== this.generation) return;
        this.loadStatus = 'error';
        this.error = '加载或解码失败，请检查网络后重试。';
        throw new Error(this.error);
      } finally {
        clearTimeout(timeout);
        if (generation === this.generation) {
          this.loading = null;
          this.controller = null;
          this.decoding = false;
          this.loadTimeout = null;
          this.changed();
        }
      }
    })();
    return this.loading;
  }
  cancelLoad(force = false) {
    // decodeAudioData 无取消接口，复用已开始的解码；旧播放请求仍由引擎版本号失效。
    if (this.decoding && !force) return;
    if (this.loadTimeout) clearTimeout(this.loadTimeout);
    this.loadTimeout = null;
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    this.loading = null;
    this.decoding = false;
    if (this.loadStatus === 'loading') this.loadStatus = this.buffer ? 'ready' : 'idle';
  }
  setVolume(volume: number) {
    const track = TRACKS[this.id];
    const trim = 'playbackTrim' in track ? track.playbackTrim : 1;
    this.envelope.rampTo(volumeToGain(volume, TRACK_GAIN_LIMIT * trim));
  }
  start(volume: number) {
    if (this.cleanup) {
      clearTimeout(this.cleanup);
      this.cleanup = null;
    }
    if (!this.source) {
      if (!this.buffer) throw new Error('音轨尚未就绪');
      const source = this.context.createBufferSource();
      source.buffer = this.buffer;
      source.loop = true;
      source.connect(this.gain);
      source.onended = () => {
        source.disconnect();
        if (this.source === source) this.source = null;
      };
      try {
        source.start(0, this.offset % this.buffer.duration);
      } catch (error) {
        source.disconnect();
        throw error;
      }
      this.startedAt = this.context.currentTime;
      this.source = source;
    }
    this.setVolume(volume);
  }
  fadeOff() {
    this.cancelLoad();
    if (this.cleanup) clearTimeout(this.cleanup);
    this.envelope.rampTo(0, 0.18);
    this.cleanup = setTimeout(() => {
      this.cleanup = null;
      this.releaseVoice(true);
    }, 200);
  }
  releaseVoice(reset = false) {
    if (this.cleanup) {
      clearTimeout(this.cleanup);
      this.cleanup = null;
    }
    if (this.source) {
      if (!reset && this.buffer)
        this.offset =
          (this.offset + this.context.currentTime - this.startedAt) % this.buffer.duration;
      const source = this.source;
      this.source = null;
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* 已停止的节点仍须断开。 */
      }
      source.disconnect();
    }
    if (reset) this.offset = 0;
    this.envelope.rampTo(0, 0);
  }
  dispose() {
    this.cancelLoad(true);
    this.releaseVoice(true);
    this.buffer = null;
    this.gain.disconnect();
  }
}
