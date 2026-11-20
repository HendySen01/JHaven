import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

/* global OfflineAudioContext */
const original = new URL('../artifacts/user-audio/', import.meta.url);
const rendered = new URL('../artifacts/user-audio-rendered/', import.meta.url);
const library = new URL('../apps/web/public/audio/', import.meta.url);
const files = [
  ['soft-chew', '轻柔咀嚼拟音', 'eating.wav', 1, 53, 1, -25, '89o_dev', '680180'],
  [
    'fan',
    '柔和风扇声',
    'electric-desk-fan-start-up-run-and-stop.wav',
    5.1,
    15.9,
    0.8,
    -23,
    'TimBahrij',
    '191580',
  ],
  [
    'crunchy-chew',
    '酥脆咀嚼声',
    'crunchy-bite-and-chewing-sound-effect-eating-snack.mp3',
    0.5,
    29.5,
    0.75,
    -24,
  ],
  ['mouth-asmr', '轻柔口腔 ASMR', 'wet-mouth-sounds-asmr.mp3', 13, 53, 1, -25],
  ['lego-rustle', '清脆积木翻动', 'looking-through-lego-box-sound.mp3', 1.05, 18.7, 0.55, -24],
  ['leaf-steps', '落叶脚步声', 'Feet in leaves.mp3', 1, 51, 0.9, -24],
];
const sha = (data) => createHash('sha256').update(data).digest('hex');
// 已核对来源的两个公开原件。避免同名文件误进公开构建。
const approvedHashes = {
  'soft-chew': 'd39644ccf094d9329e7f6bcb421273bffadb344d51fb262f519b8f1a485feda2',
  fan: 'cec3862ceaee13c2ecd55dd3f1121d4e3d8e0eb1d198b5a0ec7e5d90fa9b4554',
};
const rate = 32000;
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {},
);
const processed = [];
try {
  const page = await browser.newPage();
  for (const [id, name, filename, start, end, fade, rms, author, freesound] of files) {
    const raw = await readFile(new URL(filename, original));
    const sourceSha256 = sha(raw);
    if (freesound && sourceSha256 !== approvedHashes[id])
      throw new Error(`${filename} 与本轮核对过的公开原件不一致。`);
    const result = await page.evaluate(
      async ({ encoded, start, end, fade, rms, rate }) => {
        const context = new OfflineAudioContext(1, 1, rate);
        const audio = await context.decodeAudioData(
          Uint8Array.from(atob(encoded), (symbol) => symbol.charCodeAt(0)).buffer,
        );
        if (audio.duration < end) throw new Error('录音比选择的片段短。');
        const first = Math.round(start * rate);
        const span = Math.round(end * rate) - first;
        const overlap = Math.round(fade * rate);
        const source = new Float32Array(span);
        for (let channel = 0; channel < audio.numberOfChannels; channel++) {
          const pcm = audio.getChannelData(channel);
          for (let i = 0; i < span; i++) source[i] += pcm[first + i] / audio.numberOfChannels;
        }
        const loop = source.slice(overlap);
        for (let i = 0; i < overlap; i++) {
          const angle = ((i + 1) * Math.PI) / (2 * overlap);
          const index = loop.length - overlap + i;
          loop[index] = loop[index] * Math.cos(angle) + source[i] * Math.sin(angle);
        }
        const mean = loop.reduce((total, value) => total + value, 0) / loop.length;
        const inputRms = Math.sqrt(
          loop.reduce((total, value) => total + (value - mean) ** 2, 0) / loop.length,
        );
        if (!Number.isFinite(inputRms) || inputRms < 0.0001)
          throw new Error('片段电平过低或无效。');
        const gain = 10 ** ((rms + 1) / 20) / inputRms;
        const amplitude = (value) => {
          const level = Math.abs(value);
          return (
            Math.sign(value) * (level <= 0.2 ? level : 0.2 + 0.16 * Math.tanh((level - 0.2) / 0.16))
          );
        };
        const window = rate / 20;
        const levels = [];
        for (let offset = 0; offset < loop.length; offset += window) {
          let energy = 0;
          const stop = Math.min(loop.length, offset + window);
          for (let i = offset; i < stop; i++) energy += amplitude((loop[i] - mean) * gain) ** 2;
          levels.push(Math.sqrt(energy / (stop - offset)));
        }
        // 压低短时过响窗口，并在相邻窗口间连续插值，保留原来的停顿和节奏。
        const ceiling = 10 ** ((rms + 7) / 20);
        const windowGain = levels.map((level, i) => {
          const previous = levels[(i + levels.length - 1) % levels.length];
          const limit = Math.min(ceiling, Math.max(10 ** (-22 / 20), previous * 10 ** (15 / 20)));
          return Math.min(1, limit / Math.max(limit, level));
        });
        const samples = Array.from(loop, (value) =>
          Math.round(amplitude((value - mean) * gain) * 32767),
        );
        for (let i = 0; i < samples.length; i++) {
          const block = Math.floor(i / window);
          const ratio = (i % window) / window;
          const before = Math.min(
            windowGain[(block + windowGain.length - 1) % windowGain.length],
            windowGain[block],
          );
          const after = Math.min(windowGain[block], windowGain[(block + 1) % windowGain.length]);
          samples[i] = Math.round(samples[i] * (before + (after - before) * ratio));
        }
        return {
          samples,
          duration: audio.duration,
          channels: audio.numberOfChannels,
          inputRmsDb: 20 * Math.log10(inputRms),
        };
      },
      { encoded: raw.toString('base64'), start, end, fade, rms, rate },
    );
    if (
      freesound &&
      (result.channels !== 1 || Math.abs(result.duration - (id === 'fan' ? 24.216 : 61.579)) > 0.03)
    )
      throw new Error(`${filename} 的声道或时长与来源资料不符。`);
    const wave = Buffer.alloc(44 + result.samples.length * 2);
    wave.write('RIFF');
    wave.writeUInt32LE(wave.length - 8, 4);
    wave.write('WAVEfmt ', 8);
    wave.writeUInt32LE(16, 16);
    wave.writeUInt16LE(1, 20);
    wave.writeUInt16LE(1, 22);
    wave.writeUInt32LE(rate, 24);
    wave.writeUInt32LE(rate * 2, 28);
    wave.writeUInt16LE(2, 32);
    wave.writeUInt16LE(16, 34);
    wave.write('data', 36);
    wave.writeUInt32LE(wave.length - 44, 40);
    for (const [index, sample] of result.samples.entries())
      wave.writeInt16LE(sample, 44 + index * 2);
    const data = {
      id,
      name,
      author: author ?? '待核实',
      source: freesound ? `https://freesound.org/people/${author}/sounds/${freesound}/` : filename,
      sourceFile: filename,
      sourceSha256,
      sourceSeconds: +result.duration.toFixed(3),
      sourceChannels: result.channels,
      inputRmsDb: +result.inputRmsDb.toFixed(1),
      changes: `${start}–${end} 秒连续片段；${fade} 秒交叉淡化、去直流、RMS 调整、短时动态保护和软限峰。`,
      license: freesound ? 'CC0-1.0' : 'LicenseRef-Local-Audition',
      licenseUrl: freesound ? 'https://creativecommons.org/publicdomain/zero/1.0/' : null,
      file: `${id}.wav`,
      format: 'PCM WAV 16-bit mono',
      sampleRate: rate,
      seconds: result.samples.length / rate,
      bytes: wave.length,
      sha256: sha(wave),
      verifiedOn: '2026-11-20',
    };
    processed.push({ wave, data });
  }
} finally {
  await browser.close();
}
await mkdir(rendered, { recursive: true });
const publicManifest = JSON.parse(await readFile(new URL('manifest.json', library), 'utf8'));
for (const { wave, data } of processed) {
  if (data.license === 'CC0-1.0') {
    const index = publicManifest.findIndex(({ id }) => id === data.id);
    if (index < 0) throw new Error(`缺少待替换音轨 ${data.id}`);
    if (publicManifest[index].license === 'LicenseRef-JHaven-Original') {
      await copyFile(
        new URL(data.file, library),
        new URL(`${data.id}.previous-synthetic.wav`, rendered),
        constants.COPYFILE_EXCL,
      ).catch((error) => {
        if (error.code !== 'EEXIST') throw error;
      });
    }
    await writeFile(new URL(data.file, library), wave);
    publicManifest[index] = data;
  } else await writeFile(new URL(data.file, rendered), wave);
}
await writeFile(
  new URL('manifest.json', rendered),
  JSON.stringify(
    processed
      .filter(({ data }) => data.license === 'LicenseRef-Local-Audition')
      .map(({ data }) => data),
    null,
    2,
  ) + '\n',
);
await writeFile(new URL('manifest.json', library), JSON.stringify(publicManifest, null, 2) + '\n');
await writeFile(
  new URL('ATTRIBUTION.txt', library),
  [
    'JHaven 环境音来源与署名',
    '公开声库的外部录音采用 CC0-1.0。项目自制音以 JHaven 名义随产品分发。',
    '许可：https://creativecommons.org/publicdomain/zero/1.0/',
    ...publicManifest.map(
      (asset) =>
        `\n${asset.file} — ${asset.name}\n作者：${asset.author}\n来源：${asset.source}\n许可：${asset.license}\n处理：${asset.changes}\nSHA-256: ${asset.sha256}`,
    ),
    '',
  ].join('\n'),
);
console.table(
  processed.map(({ data }) => ({
    id: data.id,
    originalSeconds: data.sourceSeconds,
    channels: data.sourceChannels,
    outputSeconds: data.seconds,
    inputRmsDb: data.inputRmsDb,
    license: data.license,
  })),
);
