// 维护者工具：下载已核查的 CC0 公开预览，或合成本项目的背景声音。
/* global OfflineAudioContext */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = [
  {
    id: 'rain',
    name: 'Soft rain.WAV',
    author: 'barkenov',
    source: 'https://freesound.org/people/barkenov/sounds/640655/',
    download: 'https://cdn.freesound.org/previews/640/640655_2414299-hq.mp3',
  },
  {
    id: 'ocean',
    name: 'Calm ocean waves',
    author: 'SamsterBirdies',
    source: 'https://freesound.org/people/SamsterBirdies/sounds/578524/',
    download: 'https://cdn.freesound.org/previews/578/578524_5487341-hq.mp3',
  },
  {
    id: 'wind',
    name: 'Ambiance_Wind_Forest_Trees_Loop_01.wav',
    author: 'Nox_Sound',
    source: 'https://freesound.org/people/Nox_Sound/sounds/530908/',
    download: 'https://cdn.freesound.org/previews/530/530908_9250976-hq.mp3',
  },
];
const additions = [
  ['window-rain', 'Rain_Hitting_Window_9', 'SignatureSoundsOrg', '869851', '19205925'],
  ['stream', 'Small brook, stream, water sound', 'SamsterBirdies', '584269', '5487341'],
  ['tide', 'Distant waves breaking on the shore', 'apintofmild', '866070', '9813501'],
  ['leaves', 'Soft Wind in the Trees - Leaves rustle', 'Borgory', '751473', '801011'],
].map(([id, name, author, number, uploader]) => ({
  id,
  name,
  author,
  source: `https://freesound.org/people/${author}/sounds/${number}/`,
  download: `https://cdn.freesound.org/previews/${number.slice(0, -3)}/${number}_${uploader}-hq.mp3`,
}));
const selected = process.argv.includes('--originals') ? assets : [assets[0], ...additions];
const out = path.join(root, 'apps/web/public/audio');
const raw = path.join(root, 'artifacts/audio-sources');
await mkdir(out, { recursive: true });
await mkdir(raw, { recursive: true });
await Promise.all(
  selected.map(async (asset) => {
    const target = path.join(raw, `${asset.id}.mp3`);
    try {
      if ((await readFile(target)).length > 1000) return;
    } catch {
      /* 尚无已完成的本地下载。 */
    }
    const probe = await fetch(asset.download, {
      signal: AbortSignal.timeout(20_000),
      headers: { Range: 'bytes=0-0' },
    });
    const total = Number(probe.headers.get('content-range')?.split('/').at(-1));
    await probe.arrayBuffer();
    if (probe.status !== 206 || !Number.isFinite(total) || total < 1000 || total > 8 * 1024 * 1024)
      throw new Error(`${asset.id}: 下载长度无效`);
    const chunks = [];
    for (let start = 0; start < total; start += 262144)
      chunks.push({ start, end: Math.min(total - 1, start + 262143) });
    const pieces = [];
    for (let offset = 0; offset < chunks.length; offset += 3) {
      pieces.push(
        ...(await Promise.all(
          chunks.slice(offset, offset + 3).map(async ({ start, end }) => {
            const response = await fetch(asset.download, {
              signal: AbortSignal.timeout(30_000),
              headers: { Range: `bytes=${start}-${end}` },
            });
            const data = Buffer.from(await response.arrayBuffer());
            if (
              response.status !== 206 ||
              data.length !== end - start + 1 ||
              response.headers.get('content-range') !== `bytes ${start}-${end}/${total}`
            )
              throw new Error(`${asset.id}: 分段下载不完整`);
            return data;
          }),
        )),
      );
    }
    await writeFile(target, Buffer.concat(pieces));
  }),
);
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {},
);
const manifest = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8'));
function record(asset) {
  const index = manifest.findIndex((entry) => entry.id === asset.id);
  if (index === -1) manifest.push(asset);
  else manifest[index] = asset;
}
async function writeWave(asset, pcm, rate, original = false) {
  const header = Buffer.alloc(44);
  header.write('RIFF');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  const output = Buffer.concat([header, pcm]);
  const file = `${asset.id}.wav`;
  await writeFile(path.join(out, file), output);
  record({
    ...asset,
    license: original ? 'LicenseRef-JHaven-Original' : 'CC0-1.0',
    licenseUrl: original ? null : 'https://creativecommons.org/publicdomain/zero/1.0/',
    file,
    format: 'PCM WAV 16-bit mono',
    sampleRate: rate,
    seconds: pcm.length / (rate * 2),
    bytes: output.length,
    sha256: createHash('sha256').update(output).digest('hex'),
    verifiedOn: '2026-11-18',
  });
}
try {
  const page = await browser.newPage();
  for (const asset of selected) {
    const input = await readFile(path.join(raw, `${asset.id}.mp3`));
    const result = await page.evaluate(
      async ({ base64, legacy }) => {
        const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        const rate = 32000;
        const frames = rate * 24;
        const context = new OfflineAudioContext(1, frames, rate);
        const decoded = await context.decodeAudioData(bytes.buffer);
        if (decoded.duration < 29) throw new Error('原始录音不足 29 秒');
        const source = context.createBufferSource();
        source.buffer = decoded;
        if (legacy) source.connect(context.destination);
        else {
          const lowPass = context.createBiquadFilter();
          lowPass.type = 'lowpass';
          lowPass.frequency.value = 6500;
          source.connect(lowPass).connect(context.destination);
        }
        source.start(0, 5);
        const rendered = await context.startRendering();
        const inputSamples = rendered.getChannelData(0);
        const overlap = 3 * rate;
        const samples = inputSamples.slice(overlap);
        for (let index = 0; index < overlap; index++) {
          const alpha = index / overlap;
          const target = samples.length - overlap + index;
          samples[target] = samples[target] * (1 - alpha) + inputSamples[index] * alpha;
        }
        let peak = 0;
        let energy = 0;
        for (const sample of samples) {
          peak = Math.max(peak, Math.abs(sample));
          energy += sample * sample;
        }
        if (peak < 0.0001) throw new Error('音轨为空或近乎静音');
        const gain = legacy ? 0.65 / peak : 0.075 / Math.sqrt(energy / samples.length);
        const pcm = new Uint8Array(samples.length * 2);
        const view = new DataView(pcm.buffer);
        for (let index = 0; index < samples.length; index++) {
          const value = samples[index] * gain;
          const magnitude = Math.abs(value);
          const shaped =
            legacy || magnitude <= 0.16
              ? value
              : Math.sign(value) * (0.16 + 0.22 * Math.tanh((magnitude - 0.16) / 0.22));
          view.setInt16(index * 2, Math.round(shaped * 32767), true);
        }
        let binary = '';
        for (let index = 0; index < pcm.length; index += 16384)
          binary += String.fromCharCode(...pcm.subarray(index, index + 16384));
        return {
          pcm: btoa(binary),
          rate,
          originalDuration: decoded.duration,
        };
      },
      { base64: input.toString('base64'), legacy: selected === assets },
    );
    const pcm = Buffer.from(result.pcm, 'base64');
    await writeWave(
      {
        ...asset,
        sourceSha256: createHash('sha256').update(input).digest('hex'),
        originalDuration: result.originalDuration,
        changes: `公开 HQ 预览 5–29 秒，单声道下混，3 秒交叉渐变。${selected === assets ? '峰值归一到 0.65' : '6.5 kHz 低通、RMS 整形前目标 0.075、0.16 以上软峰值整形'}。`,
      },
      pcm,
      result.rate,
    );
  }
} finally {
  await browser.close();
}
if (selected !== assets) {
  const rate = 32000;
  const count = rate * 12;
  for (const [id, name, seed] of [
    ['pink', '粉红噪音', 713],
    ['white', '白噪音', 907],
    ['fan', '柔和风扇声', 591],
  ]) {
    let state = seed;
    let low = 0;
    const octaves = new Float64Array(13);
    const samples = new Float64Array(count + rate);
    function noise() {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 2147483648 - 1;
    }
    for (let i = 0; i < samples.length; i++) {
      const white = noise();
      if (id === 'pink') {
        for (let band = 0; band < octaves.length; band++)
          if (i % 2 ** band === 0) octaves[band] = noise();
        samples[i] = white + octaves.reduce((sum, value) => sum + value, 0);
      } else if (id === 'fan') {
        low += 0.13 * (white - low);
        const phase = (2 * Math.PI * 83 * i) / rate;
        samples[i] = low + 0.045 * Math.sin(phase) + 0.023 * Math.sin(2 * phase);
      } else samples[i] = white;
    }
    const loop = samples.slice(rate);
    for (let i = 0; i < rate; i++) {
      const angle = (Math.PI * i) / (2 * rate);
      loop[count - rate + i] =
        loop[count - rate + i] * Math.cos(angle) + samples[i] * Math.sin(angle);
    }
    const mean = loop.reduce((sum, value) => sum + value, 0) / count;
    let peak = 0;
    let energy = 0;
    for (const sample of loop) {
      peak = Math.max(peak, Math.abs(sample - mean));
      energy += (sample - mean) ** 2;
    }
    const gain = Math.min(0.6 / peak, 0.075 / Math.sqrt(energy / count));
    const pcm = Buffer.alloc(count * 2);
    for (let i = 0; i < count; i++)
      pcm.writeInt16LE(Math.round((loop[i] - mean) * gain * 32767), i * 2);
    await writeWave(
      {
        id,
        name,
        author: 'JHaven',
        source: 'scripts/prepare-audio.mjs',
        changes: '确定性合成；去直流、等功率交叉渐变、RMS 及峰值整形。',
      },
      pcm,
      rate,
      true,
    );
  }
}
await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(
  path.join(out, 'ATTRIBUTION.txt'),
  [
    'JHaven 环境音来源与署名',
    '外部录音采用 CC0-1.0。JHaven 合成 WAV 为项目自制素材，由 JHaven 随产品分发。',
    '许可：https://creativecommons.org/publicdomain/zero/1.0/',
    ...manifest.map(
      (asset) =>
        `\n${asset.id}.wav — ${asset.name}\n作者：${asset.author}\n来源：${asset.source}\n许可：${asset.license}\n处理：${asset.changes}\nSHA-256: ${asset.sha256}`,
    ),
    '',
  ].join('\n'),
);
console.info(
  `清单包含 ${manifest.length} 条循环音轨，合计 ${manifest.reduce((sum, asset) => sum + asset.bytes, 0)} 字节。`,
);
