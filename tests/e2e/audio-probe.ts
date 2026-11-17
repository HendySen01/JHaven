import type { Page } from '@playwright/test';

interface Probe {
  contexts: AudioContext[];
  voices: Set<AudioBufferSourceNode>;
  analysers: AnalyserNode[];
  decoded: number;
}
declare global {
  interface Window {
    __jhavenAudioProbe: Probe;
  }
}

// 测试专用：使用真实 AudioContext/解码器/节点，以静音支路采样，避免测试打扰设备使用者。
export async function installAudioProbe(page: Page) {
  await page.addInitScript(() => {
    const probe: Probe = { contexts: [], voices: new Set(), analysers: [], decoded: 0 };
    window.__jhavenAudioProbe = probe;
    const NativeContext = window.AudioContext;
    window.AudioContext = new Proxy(NativeContext, {
      construct(Target, args) {
        const context = Reflect.construct(Target, args) as AudioContext;
        probe.contexts.push(context);
        const decode = context.decodeAudioData.bind(context);
        context.decodeAudioData = (bytes: ArrayBuffer) => {
          probe.decoded++;
          return decode(bytes);
        };
        const createSource = context.createBufferSource.bind(context);
        context.createBufferSource = () => {
          const source = createSource();
          const start = source.start.bind(source);
          const stop = source.stop.bind(source);
          source.start = (when = 0, offset = 0) => {
            start(when, offset);
            probe.voices.add(source);
          };
          source.stop = (when = 0) => {
            stop(when);
            probe.voices.delete(source);
          };
          source.addEventListener('ended', () => probe.voices.delete(source));
          return source;
        };
        const createGain = context.createGain.bind(context);
        context.createGain = () => {
          const node = createGain();
          node.connect = new Proxy(node.connect, {
            apply(target, thisArg, params) {
              if (params[0] === context.destination) {
                const analyser = context.createAnalyser();
                analyser.fftSize = 2048;
                const mute = createGain();
                mute.gain.value = 0;
                Reflect.apply(target, thisArg, [analyser]);
                analyser.connect(mute);
                mute.connect(context.destination);
                probe.analysers.push(analyser);
                return context.destination;
              }
              return Reflect.apply(target, thisArg, params);
            },
          });
          return node;
        };
        return context;
      },
    });
  });
}
export async function readAudioProbe(page: Page) {
  return page.evaluate(() => {
    const probe = window.__jhavenAudioProbe;
    const analyser = probe.analysers.at(-1);
    let rms = 0;
    if (analyser) {
      const samples = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(samples);
      rms = Math.sqrt(samples.reduce((sum, value) => sum + value ** 2, 0) / samples.length);
    }
    return {
      contexts: probe.contexts.length,
      active: probe.voices.size,
      decoded: probe.decoded,
      rms,
    };
  });
}
