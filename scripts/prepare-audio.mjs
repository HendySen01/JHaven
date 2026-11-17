// 维护者工具：显式下载已逐项核查的 CC0 公开预览，并制作紧凑循环音轨。
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
const out = path.join(root, 'apps/web/public/audio');
const raw = path.join(root, 'artifacts/audio-sources');
await mkdir(out, { recursive: true });
await mkdir(raw, { recursive: true });
await Promise.all(
  assets.map(async (asset) => {
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
const manifest = [];
try {
  const page = await browser.newPage();
  for (const asset of assets) {
    const input = await readFile(path.join(raw, `${asset.id}.mp3`));
    const result = await page.evaluate(async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const rate = 32000;
      const frames = rate * 24;
      const context = new OfflineAudioContext(1, frames, rate);
      const decoded = await context.decodeAudioData(bytes.buffer);
      if (decoded.duration < 29) throw new Error('原始录音不足 29 秒');
      const source = context.createBufferSource();
      source.buffer = decoded;
      source.connect(context.destination);
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
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
      if (peak < 0.0001) throw new Error('音轨为空或近乎静音');
      const pcm = new Uint8Array(samples.length * 2);
      const view = new DataView(pcm.buffer);
      for (let index = 0; index < samples.length; index++) {
        view.setInt16(index * 2, Math.round((samples[index] / peak) * 0.65 * 32767), true);
      }
      let binary = '';
      for (let index = 0; index < pcm.length; index += 16384)
        binary += String.fromCharCode(...pcm.subarray(index, index + 16384));
      return {
        pcm: btoa(binary),
        rate,
        frames: samples.length,
        originalDuration: decoded.duration,
      };
    }, input.toString('base64'));
    const pcm = Buffer.from(result.pcm, 'base64');
    const header = Buffer.alloc(44);
    header.write('RIFF');
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(result.rate, 24);
    header.writeUInt32LE(result.rate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcm.length, 40);
    const output = Buffer.concat([header, pcm]);
    await writeFile(path.join(out, `${asset.id}.wav`), output);
    manifest.push({
      ...asset,
      license: 'CC0-1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      file: `${asset.id}.wav`,
      format: 'PCM WAV 16-bit mono',
      sampleRate: result.rate,
      seconds: result.frames / result.rate,
      bytes: output.length,
      sha256: createHash('sha256').update(output).digest('hex'),
      sourceSha256: createHash('sha256').update(input).digest('hex'),
      originalDuration: result.originalDuration,
      changes:
        '公开 HQ MP3 预览的第 5–29 秒；下混单声道 32kHz，尾部 3 秒线性交叉渐变，峰值归一到 0.65，输出 21 秒循环。非 LUFS 校准。',
      verifiedOn: '2026-11-18',
    });
  }
} finally {
  await browser.close();
}
await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(
  path.join(out, 'ATTRIBUTION.txt'),
  [
    'JHaven 环境音来源与署名',
    '各录音原始页面均标注 CC0-1.0；允许修改、再分发和商业使用，保留署名以便追溯。',
    '许可：https://creativecommons.org/publicdomain/zero/1.0/',
    ...manifest.map(
      (asset) =>
        `\n${asset.id}.wav — ${asset.name}\n作者：${asset.author}\n来源：${asset.source}\n处理：${asset.changes}\nSHA-256: ${asset.sha256}`,
    ),
    '',
  ].join('\n'),
);
console.info(
  `已制作 ${manifest.length} 条 CC0 实录循环音轨，合计 ${manifest.reduce((sum, asset) => sum + asset.bytes, 0)} 字节。`,
);
