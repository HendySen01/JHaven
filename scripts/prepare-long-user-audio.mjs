import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// 仅维护者显式执行；部署和运行时无需 FFmpeg 或原始 MP3。
const original = new URL('../artifacts/user-audio/', import.meta.url);
const library = new URL('../apps/web/public/audio/', import.meta.url);
const files = [
  [
    'beef-rice-swallow',
    '牛排骨-牛肉拌饭吞咽声',
    '牛排骨-牛肉拌饭吞咽声.mp3',
    '45bc882fbb63f93486c05ab9a91fa71c221c16b550d9f2d4cfffce113ffb18bf',
  ],
  [
    'spicy-noodle-swallow',
    '火鸡面吞咽声',
    '火鸡面吞咽声.mp3',
    '98eefe8cc90b9dd2f2790d915a1c3fd8e905c2b093141fd5cbd9cc54b9859016',
  ],
];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const rate = 32000;
const window = rate / 20;
const target = -23;
const manifest = JSON.parse(await readFile(new URL('manifest.json', library), 'utf8'));
function levels(samples) {
  const result = [];
  for (let offset = 0; offset < samples.length; offset += window) {
    const end = Math.min(samples.length, offset + window);
    let energy = 0;
    for (let i = offset; i < end; i++) energy += samples[i] ** 2;
    result.push(Math.sqrt(energy / (end - offset)));
  }
  return result;
}
function applyEnvelope(samples, gain) {
  for (let i = 0; i < samples.length; i++) {
    const block = Math.floor(i / window);
    const before = Math.min(gain[(block + gain.length - 1) % gain.length], gain[block]);
    const after = Math.min(gain[block], gain[(block + 1) % gain.length]);
    samples[i] *= before + (after - before) * ((i % window) / window);
  }
}
const db = (value) => 20 * Math.log10(Math.max(1e-12, value));
const results = [];
for (const [id, name, filename, sourceSha256] of files) {
  const input = new URL(filename, original);
  if (sha(await readFile(input)) !== sourceSha256) throw new Error(`${filename} 原件哈希不符`);
  const decode = spawnSync(
    process.env.FFMPEG_PATH || 'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      fileURLToPath(input),
      '-ac',
      '1',
      '-ar',
      String(rate),
      '-f',
      'f32le',
      '-',
    ],
    { maxBuffer: 40 * 1024 * 1024 },
  );
  if (decode.error || decode.status !== 0) throw new Error(`${filename} FFmpeg 解码失败`);
  const frames = decode.stdout.length / 4;
  if (!Number.isInteger(frames) || frames <= rate * 60 || frames > rate * 250)
    throw new Error(`${filename} 原件长度不符`);
  const source = new Float32Array(frames);
  for (let i = 0; i < frames; i++) source[i] = decode.stdout.readFloatLE(i * 4);
  // 整段保留，仅将首尾 1 秒等功率重叠以形成循环。
  const samples = Float64Array.from(source.subarray(rate));
  for (let i = 0; i < rate; i++) {
    const angle = ((i + 1) * Math.PI) / (2 * rate);
    const index = samples.length - rate + i;
    samples[index] = samples[index] * Math.cos(angle) + source[i] * Math.sin(angle);
  }
  const mean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
  const inputRms = Math.sqrt(samples.reduce((sum, x) => sum + (x - mean) ** 2, 0) / samples.length);
  if (!Number.isFinite(inputRms) || inputRms < 0.0001) throw new Error('录音电平无效');
  const gain = 10 ** ((target + 1) / 20) / inputRms;
  for (let i = 0; i < samples.length; i++) {
    const x = (samples[i] - mean) * gain;
    const a = Math.abs(x);
    samples[i] = Math.sign(x) * (a <= 0.2 ? a : 0.2 + 0.16 * Math.tanh((a - 0.2) / 0.16));
  }
  const initial = levels(samples);
  const ceiling = 10 ** ((target + 7) / 20);
  applyEnvelope(
    samples,
    initial.map((level, i) => {
      const previous = initial[(i + initial.length - 1) % initial.length];
      const limit = Math.min(ceiling, Math.max(10 ** (-22 / 20), previous * 10 ** (15 / 20)));
      return Math.min(1, limit / Math.max(limit, level));
    }),
  );
  // 长录音保留安静间隔，额外抑制突然从间隔进入的响声，不加入人工底噪。
  for (let pass = 0; pass < 8; pass++) {
    const measured = levels(samples).map(db);
    const gains = measured.map((level, i) => {
      const previous = measured[i === 0 ? Math.floor(samples.length / window) - 1 : i - 1];
      const limit = Math.min(previous + 22, Math.max(-20.5, previous + 15));
      return 10 ** (Math.min(0, limit - level) / 20);
    });
    if (gains.every((value) => value >= 0.99999)) break;
    applyEnvelope(samples, gains);
  }
  const wave = Buffer.alloc(44 + samples.length * 2);
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
  for (let i = 0; i < samples.length; i++)
    wave.writeInt16LE(Math.round(samples[i] * 32767), 44 + i * 2);
  const data = {
    id,
    name,
    author: null,
    source: filename,
    sourceFile: filename,
    sourceSha256,
    sourceSeconds: frames / rate,
    sourceChannels: 2,
    inputRmsDb: +db(inputRms).toFixed(1),
    changes: '保留原始录音全段，首尾 1 秒等功率交叉淡化；去直流、RMS 调整、短时动态保护和软限峰。',
    license: null,
    distribution: 'maintainer-confirmed',
    licenseUrl: null,
    file: `${id}.wav`,
    format: 'PCM WAV 16-bit mono',
    sampleRate: rate,
    seconds: samples.length / rate,
    bytes: wave.length,
    sha256: sha(wave),
    verifiedOn: '2026-11-26',
  };
  results.push({ data, wave });
}
for (const { data, wave } of results) {
  const index = manifest.findIndex((asset) => asset.id === data.id);
  if (index === -1) manifest.push(data);
  else manifest[index] = data;
  await writeFile(new URL(data.file, library), wave);
}
await writeFile(new URL('manifest.json', library), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(
  new URL('ATTRIBUTION.txt', library),
  [
    'JHaven 环境音来源与署名',
    '逐轨许可与分发来源如下。项目自制音以 JHaven 名义随产品分发。',
    '许可：https://creativecommons.org/publicdomain/zero/1.0/',
    ...manifest.map((asset) => {
      const permission = asset.license
        ? `许可：${asset.license}`
        : '公开分发：维护者确认，未提供具体许可证名称';
      return `\n${asset.file} — ${asset.name}\n作者：${asset.author ?? '未提供'}\n来源：${asset.source}\n${permission}\n处理：${asset.changes}\nSHA-256: ${asset.sha256}`;
    }),
    '',
  ].join('\n'),
);
console.table(
  results.map(({ data }) => ({
    id: data.id,
    originalSeconds: data.sourceSeconds,
    seconds: data.seconds,
    bytes: data.bytes,
  })),
);
