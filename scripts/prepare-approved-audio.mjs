import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

/* global OfflineAudioContext */
const sources = {
  'soft-chew': {
    name: 'eating.wav',
    author: '89o_dev',
    source: 'https://freesound.org/people/89o_dev/sounds/680180/',
    duration: 61.579,
    rate: 44100,
    bits: 16,
    rms: -24,
  },
  fan: {
    name: 'electric desk fan start up, run and stop.',
    author: 'TimBahrij',
    source: 'https://freesound.org/people/TimBahrij/sounds/191580/',
    duration: 24.216,
    rate: 96000,
    bits: 24,
    rms: -23,
  },
};
const [id, startArg, endArg, extra] = process.argv.slice(2);
const asset = Object.hasOwn(sources, id) ? sources[id] : undefined;
const start = Number(startArg);
const end = Number(endArg);
const seconds = end - start - 1;
if (
  extra ||
  !asset ||
  !Number.isFinite(start) ||
  !Number.isFinite(end) ||
  start < 0 ||
  end > asset.duration ||
  !Number.isInteger(seconds) ||
  seconds < 10 ||
  seconds > 30
)
  throw new Error(
    '用法：node scripts/prepare-approved-audio.mjs <fan|soft-chew> <开始秒> <结束秒>。选定片段需为 11–31 秒整数长度，最后 1 秒用于交叉淡化。',
  );

const directory = new URL('../artifacts/sprint9-audio/', import.meta.url);
const sourceFile = new URL(`${id}.original.wav`, directory);
const info = await stat(sourceFile).catch((error) => {
  if (error.code === 'ENOENT')
    throw new Error(`缺少 ${id}.original.wav，请从 Freesound 登录下载原始 WAV。`);
  throw error;
});
if (!info.isFile() || info.size > 16 * 1024 * 1024) throw new Error('原始 WAV 文件大小异常。');
const input = await readFile(sourceFile);
if (input.toString('ascii', 0, 4) !== 'RIFF' || input.toString('ascii', 8, 12) !== 'WAVE')
  throw new Error('需要原始 RIFF WAV。');
let formatOffset = -1;
for (let offset = 12; offset + 8 <= input.length;) {
  const length = input.readUInt32LE(offset + 4);
  if (offset + 8 + length > input.length) throw new Error('WAV 区块不完整。');
  if (input.toString('ascii', offset, offset + 4) === 'fmt ' && length >= 16) {
    formatOffset = offset + 8;
    break;
  }
  offset += 8 + length + (length % 2);
}
if (
  formatOffset < 0 ||
  input.readUInt16LE(formatOffset + 2) !== 1 ||
  input.readUInt32LE(formatOffset + 4) !== asset.rate ||
  input.readUInt16LE(formatOffset + 14) !== asset.bits
)
  throw new Error('声道、采样率或位深与来源记录不符。');
const rate = 32000;
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {},
);
let samples;
try {
  const page = await browser.newPage();
  samples = await page.evaluate(
    async ({ encoded, rate, start, end, duration, targetDb }) => {
      const context = new OfflineAudioContext(1, 1, rate);
      const decoded = await context.decodeAudioData(
        Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)).buffer,
      );
      if (decoded.numberOfChannels !== 1 || Math.abs(decoded.duration - duration) > 0.03)
        throw new Error('声道或时长与 Freesound 原始文件资料不符。');
      const segment = decoded
        .getChannelData(0)
        .slice(Math.round(start * rate), Math.round(end * rate));
      const frames = segment.length - rate;
      const loop = segment.slice(rate);
      // 用开头一秒替换尾部的一部分，保留相邻采样的自然循环。
      for (let i = 0; i < rate; i++) {
        const angle = (((i + 1) / rate) * Math.PI) / 2;
        const index = frames - rate + i;
        loop[index] = loop[index] * Math.cos(angle) + segment[i] * Math.sin(angle);
      }
      const mean = loop.reduce((sum, n) => sum + n, 0) / frames;
      const rms = Math.sqrt(loop.reduce((sum, n) => sum + (n - mean) ** 2, 0) / frames);
      if (!Number.isFinite(rms) || rms < 0.0001) throw new Error('片段过静或损坏。');
      const gain = Math.min(8, 10 ** (targetDb / 20) / rms);
      let peak = 0;
      for (const sample of loop) peak = Math.max(peak, Math.abs(sample - mean));
      const scale = Math.min(gain, 0.62 / peak);
      return Array.from(loop, (sample) => Math.round((sample - mean) * scale * 32767));
    },
    {
      encoded: input.toString('base64'),
      rate,
      start,
      end,
      duration: asset.duration,
      targetDb: asset.rms,
    },
  );
} finally {
  await browser.close();
}
const wav = Buffer.alloc(44 + samples.length * 2);
wav.write('RIFF');
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(wav.length - 44, 40);
for (const [index, sample] of samples.entries()) wav.writeInt16LE(sample, 44 + index * 2);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const record = {
  id,
  name: asset.name,
  author: asset.author,
  source: asset.source,
  sourceSha256: sha(input),
  changes: `原始 WAV 的 ${start}–${end} 秒片段。1 秒等功率交叉淡化、去直流、响度及峰值整形。`,
  license: 'CC0-1.0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  file: `${id}.wav`,
  format: 'PCM WAV 16-bit mono',
  sampleRate: rate,
  seconds,
  bytes: wav.length,
  sha256: sha(wav),
  verifiedOn: '2026-11-20',
};
await mkdir(directory, { recursive: true });
await writeFile(new URL(record.file, directory), wav);
await writeFile(new URL(`${id}.manifest.json`, directory), JSON.stringify(record, null, 2) + '\n');
console.info(`试听文件及清单已生成到 artifacts/sprint9-audio。请试听并审核后再更新正式音轨。`);
