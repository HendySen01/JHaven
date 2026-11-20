import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = new URL('../apps/web/public/audio/', import.meta.url);
const localBase = new URL('../artifacts/user-audio-rendered/', import.meta.url);
const catalog = JSON.parse(
  await readFile(new URL('../packages/shared/src/sound-catalog.json', import.meta.url), 'utf8'),
);
const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
const ids = Object.keys(catalog).filter((id) => !catalog[id].localOnly);
const localIds = Object.keys(catalog).filter((id) => catalog[id].localOnly);
const localManifest = await readFile(new URL('manifest.json', localBase), 'utf8')
  .then(JSON.parse)
  .catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
const approvedOriginals = new Map([
  ['soft-chew', 'https://freesound.org/people/89o_dev/sounds/680180/'],
  ['fan', 'https://freesound.org/people/TimBahrij/sounds/191580/'],
]);
const wavFiles = (await readdir(base)).filter((file) => file.endsWith('.wav')).sort();
if (
  !Array.isArray(manifest) ||
  manifest.length !== ids.length ||
  JSON.stringify(wavFiles) !== JSON.stringify(ids.map((id) => `${id}.wav`).sort())
)
  throw new Error('声音目录、清单与 WAV 文件必须逐项一致');
if (localManifest.length && localManifest.length !== localIds.length)
  throw new Error('本机试听清单与本机轨道目录不一致');

const dB = (value) => 20 * Math.log10(Math.max(1e-12, value));
const metrics = [];
for (const id of [...ids, ...(localManifest.length ? localIds : [])]) {
  const local = catalog[id].localOnly === true;
  const asset = (local ? localManifest : manifest).find((item) => item.id === id);
  const approved = approvedOriginals.get(id);
  const recorded = catalog[id].category === 'nature' || (approved && asset?.license === 'CC0-1.0');
  if (
    !asset ||
    asset.file !== `${id}.wav` ||
    !asset.author ||
    !asset.name ||
    !asset.changes ||
    !/^\d{4}-\d{2}-\d{2}$/.test(asset.verifiedOn) ||
    (local
      ? asset.license !== 'LicenseRef-Local-Audition' ||
        asset.source !== asset.sourceFile ||
        !/^[a-f0-9]{64}$/.test(asset.sourceSha256)
      : recorded
        ? asset.license !== 'CC0-1.0' ||
          asset.licenseUrl !== 'https://creativecommons.org/publicdomain/zero/1.0/' ||
          !asset.source.startsWith('https://freesound.org/people/') ||
          (approved && approved !== asset.source) ||
          !/^[a-f0-9]{64}$/.test(asset.sourceSha256)
        : asset.license !== 'LicenseRef-JHaven-Original' ||
          asset.source !==
            (catalog[id].category === 'texture'
              ? 'scripts/prepare-textures.mjs'
              : 'scripts/prepare-audio.mjs'))
  )
    throw new Error(`授权清单无效：${id}`);
  const data = await readFile(new URL(asset.file, local ? localBase : base));
  if (
    data.length !== asset.bytes ||
    createHash('sha256').update(data).digest('hex') !== asset.sha256
  )
    throw new Error(`音轨校验失败：${id}`);
  const rate = 32000;
  const bytes = data.length - 44;
  if (
    data.length < 44 ||
    data.toString('ascii', 0, 4) !== 'RIFF' ||
    data.readUInt32LE(4) !== data.length - 8 ||
    data.toString('ascii', 8, 16) !== 'WAVEfmt ' ||
    data.readUInt32LE(16) !== 16 ||
    data.readUInt16LE(20) !== 1 ||
    data.readUInt16LE(22) !== 1 ||
    data.readUInt32LE(24) !== rate ||
    data.readUInt16LE(34) !== 16 ||
    data.toString('ascii', 36, 40) !== 'data' ||
    data.readUInt32LE(40) !== bytes ||
    bytes % 2 !== 0 ||
    bytes / (2 * rate) !== asset.seconds ||
    asset.sampleRate !== rate ||
    asset.seconds < 10 ||
    asset.seconds > (asset.sourceFile ? 60 : 30)
  )
    throw new Error(`音轨格式不符：${id}`);
  const frames = bytes / 2;
  const window = rate / 20;
  const levels = [];
  let peak = 0;
  let energy = 0;
  let windowEnergy = 0;
  let mean = 0;
  let maxStep = 0;
  const first = data.readInt16LE(44) / 32768;
  let previous = first;
  for (let i = 0; i < frames; i++) {
    const sample = data.readInt16LE(44 + i * 2) / 32768;
    peak = Math.max(peak, Math.abs(sample));
    maxStep = Math.max(maxStep, Math.abs(sample - previous));
    energy += sample ** 2;
    windowEnergy += sample ** 2;
    mean += sample;
    if ((i + 1) % window === 0) {
      levels.push(dB(Math.sqrt(windowEnergy / window)));
      windowEnergy = 0;
    }
    previous = sample;
  }
  const silenceWindows = levels.filter((level) => level < -55).length;
  const sorted = [...levels].sort((a, b) => a - b);
  const dynamic = sorted.at(-1) - sorted[Math.floor(sorted.length / 2)];
  const rise = Math.max(
    ...levels.map((level, i) => level - levels[(i + levels.length - 1) % levels.length]),
  );
  // 同样的增幅，在很轻的脚步间隙与较响的咬合声处影响不同。
  const loudRise = Math.max(
    0,
    ...levels.map((level, i) =>
      level >= -20 ? level - levels[(i + levels.length - 1) % levels.length] : 0,
    ),
  );
  const seam = Math.abs(first - previous);
  const rms = dB(Math.sqrt(energy / frames));
  const mixedPeak = peak * (catalog[id].playbackTrim ?? 1);
  if (mixedPeak > 0.66) throw new Error(`校准后峰值超出混音预算：${id}`);
  metrics.push({
    id,
    peak: +peak.toFixed(3),
    mixedPeak: +mixedPeak.toFixed(3),
    rmsDbFS: +rms.toFixed(1),
    maxRiseDb: +rise.toFixed(1),
    loudRiseDb: +loudRise.toFixed(1),
    peakWindowOverMedianDb: +dynamic.toFixed(1),
    silenceWindows,
    seam: +seam.toFixed(4),
    maxStep: +maxStep.toFixed(4),
    dc: +(mean / frames).toFixed(5),
  });
}
console.table(metrics);
const failures = metrics.filter((m) => {
  const transient = ['soft-chew', ...localIds].includes(m.id);
  return (
    m.rmsDbFS < -27 ||
    m.rmsDbFS > -18 ||
    m.maxRiseDb > (transient ? 24 : 12) ||
    (transient && m.loudRiseDb > 16) ||
    m.peakWindowOverMedianDb > (transient ? 18 : 16) ||
    m.silenceWindows > 0 ||
    m.maxStep > 0.8 ||
    m.seam > 0.18 ||
    m.seam > m.maxStep ||
    Math.abs(m.dc) > 0.025
  );
});
if (failures.length) throw new Error(`需要重新审核音轨：${failures.map((m) => m.id).join('、')}`);
console.info(
  `${ids.length} 条公开音轨及 ${localManifest.length} 条本机试听通过清单、哈希、格式及 PCM 质量检查。`,
);
