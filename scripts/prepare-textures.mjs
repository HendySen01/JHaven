import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = new URL('../apps/web/public/audio/', import.meta.url);
const manifestUrl = new URL('manifest.json', base);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
const rate = 32000;
const seconds = 12;
const count = seconds * rate;
const source = 'scripts/prepare-textures.mjs';

for (const [id, name, seed, smoothing, hits] of [
  ['soft-chew', '轻柔咀嚼拟音', 181, 0.095, 15],
  ['gentle-crinkle', '轻脆捏捏声', 229, 0.24, 27],
]) {
  let state = seed;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const events = Array.from({ length: hits }, (_, i) => ({
    start: (i + 0.2 + random() * 0.4) * (seconds / hits),
    duration: (id === 'soft-chew' ? 0.24 : 0.12) + random() * 0.12,
    strength: 0.45 + random() * 0.35,
  }));
  // 以很低的连续质感托住圆润的短包络，避免突然的嘴部声响或尖锐爆点。
  const samples = new Float64Array(count + rate);
  let filtered = 0;
  let glow = 0;
  for (let i = 0; i < samples.length; i++) {
    const time = (i / rate) % seconds;
    const event = events[Math.floor((time * hits) / seconds)];
    const phase = (time - event.start) / event.duration;
    const pulse = phase > 0 && phase < 1 ? Math.sin(Math.PI * phase) ** 2 * event.strength : 0;
    filtered += smoothing * (random() * 2 - 1 - filtered);
    glow += 0.017 * (filtered - glow);
    samples[i] = filtered * (0.28 + pulse) + glow * (id === 'soft-chew' ? 0.65 : 0.2);
  }
  const loop = samples.slice(rate);
  for (let i = 0; i < rate; i++) {
    const fraction = i / rate;
    loop[count - rate + i] = (1 - fraction) * loop[count - rate + i] + fraction * samples[i];
  }
  const mean = loop.reduce((sum, sample) => sum + sample, 0) / count;
  let peak = 0;
  let energy = 0;
  for (const sample of loop) {
    peak = Math.max(peak, Math.abs(sample - mean));
    energy += (sample - mean) ** 2;
  }
  const gain = Math.min(0.36 / peak, 0.064 / Math.sqrt(energy / count));
  const wav = Buffer.alloc(44 + count * 2);
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
  wav.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < loop.length; i++)
    wav.writeInt16LE(Math.round((loop[i] - mean) * gain * 32767), 44 + 2 * i);
  if (manifest.some((entry) => entry.id === id && entry.license === 'CC0-1.0')) continue;
  const file = id + '.wav';
  await writeFile(new URL(file, base), wav);
  const existing = manifest.findIndex((entry) => entry.id === id);
  const asset = {
    id,
    name,
    author: 'JHaven',
    source,
    changes: '原创确定性拟音，带限噪声、渐入渐出短包络、去直流、循环交叉淡化和峰值整形。',
    license: 'LicenseRef-JHaven-Original',
    file,
    format: 'PCM WAV 16-bit mono',
    sampleRate: rate,
    seconds,
    bytes: wav.length,
    sha256: createHash('sha256').update(wav).digest('hex'),
    verifiedOn: '2026-11-19',
  };
  if (existing < 0) manifest.push(asset);
  else manifest[existing] = asset;
}
await writeFile(manifestUrl, JSON.stringify(manifest, null, 2) + '\n');
await writeFile(
  new URL('ATTRIBUTION.txt', base),
  [
    'JHaven 环境音来源与署名',
    '外部录音采用 CC0-1.0。JHaven 合成 WAV 为项目自制素材，由 JHaven 随产品分发。',
    '许可：https://creativecommons.org/publicdomain/zero/1.0/',
    ...manifest.map(
      (a) =>
        `\n${a.id}.wav — ${a.name}\n作者：${a.author}\n来源：${a.source}\n许可：${a.license}\n处理：${a.changes}\nSHA-256: ${a.sha256}`,
    ),
    '',
  ].join('\n'),
);
