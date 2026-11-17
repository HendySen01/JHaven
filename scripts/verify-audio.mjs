import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = new URL('../apps/web/public/audio/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
if (manifest.length !== 3) throw new Error('音轨清单必须有三条');
for (const id of ['rain', 'ocean', 'wind']) {
  const asset = manifest.find((item) => item.id === id);
  if (
    !asset ||
    asset.file !== `${id}.wav` ||
    asset.license !== 'CC0-1.0' ||
    !asset.author ||
    !asset.source.startsWith('https://freesound.org/people/')
  )
    throw new Error(`授权清单无效：${id}`);
  const data = await readFile(new URL(asset.file, base));
  if (
    data.length !== asset.bytes ||
    createHash('sha256').update(data).digest('hex') !== asset.sha256
  )
    throw new Error(`音轨校验失败：${id}`);
  if (
    data.toString('ascii', 0, 4) !== 'RIFF' ||
    data.toString('ascii', 8, 12) !== 'WAVE' ||
    data.readUInt16LE(22) !== 1 ||
    data.readUInt32LE(24) !== 32000 ||
    data.readUInt32LE(40) / 64000 !== 21
  )
    throw new Error(`音轨格式不符：${id}`);
}
console.info('三条 CC0 音轨的授权字段、SHA-256、大小、时长与 WAV 头均通过。');
