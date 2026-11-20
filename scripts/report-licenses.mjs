import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
const rows = [];
const notices = [
  'JHaven 第三方依赖许可声明',
  '完整依赖版本见 package-lock.json；下列为已安装生产依赖的原始许可文本。',
];
const seen = new Set();

for (const [location, entry] of Object.entries(lock.packages)) {
  if (!location.includes('node_modules/') || entry.link) continue;
  const name = location.split('node_modules/').at(-1);
  let installed;
  try {
    installed = JSON.parse(await readFile(path.join(root, location, 'package.json'), 'utf8'));
  } catch {
    // 可选的平台专用依赖可能不安装，仍依据锁文件列出。
  }
  const license = installed?.license ?? entry.license ?? '未声明，发布前需人工复核';
  const source =
    installed?.repository?.url ?? installed?.homepage ?? `https://www.npmjs.com/package/${name}`;
  rows.push({ name, version: entry.version, license, source, installed: Boolean(installed) });

  const key = `${name}@${entry.version}`;
  if (entry.dev || !installed || seen.has(key)) continue;
  seen.add(key);
  const files = await readdir(path.join(root, location));
  const licenseFiles = files.filter((file) => /^(licen[cs]e|notice|copying)([.-]|$)/i.test(file));
  if (key === '@vue/devtools-api@6.6.4' && licenseFiles.length === 0) {
    notices.push(
      `\n${'='.repeat(72)}\n${key} — 上游版本许可补充\nhttps://raw.githubusercontent.com/vuejs/vue-devtools/v6.6.4/LICENSE\n`,
      await readFile(path.join(root, 'docs/licenses/vue-devtools-api-6.6.4-LICENSE.txt'), 'utf8'),
    );
    continue;
  }
  if (licenseFiles.length === 0 && (key === 'pg-types@2.2.0' || key === 'pgpass@1.0.5')) {
    const readme = await readFile(path.join(root, location, 'README.md'), 'utf8');
    const notice = /^#+ License[^\S\r\n]*\r?\n([\s\S]+)$/im.exec(readme)?.[1]?.trim();
    if (!notice?.includes('Permission is hereby granted'))
      throw new Error(`未找到 README 许可：${key}`);
    notices.push(`\n${'='.repeat(72)}\n${key} — README 许可\n${source}\n`, notice);
    continue;
  }
  if (licenseFiles.length === 0) throw new Error(`生产依赖缺少许可文件，请人工核查：${key}`);
  for (const file of licenseFiles) {
    notices.push(
      `\n${'='.repeat(72)}\n${key} — ${file}\n${source}\n`,
      await readFile(path.join(root, location, file), 'utf8'),
    );
  }
}

rows.sort((a, b) => a.name.localeCompare(b.name, 'en') || a.version.localeCompare(b.version, 'en'));
const escapeCell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const table = rows.map(
  (row) =>
    `| ${[row.name, row.version, row.license, row.installed ? '已安装' : '未安装（可选/平台项，需目标平台复核）', row.source].map(escapeCell).join(' | ')} |`,
);
await writeFile(
  path.join(root, 'docs/DEPENDENCY_LICENSES.md'),
  [
    '# 锁文件依赖许可清单',
    '',
    '由 `npm run licenses:report` 生成，包含直接、间接和开发依赖。许可证元数据不代替原始声明；未安装的平台项需在目标平台复核。',
    '',
    '| 包 | 版本 | 许可证 | 本机状态 | 来源 |',
    '| --- | --- | --- | --- | --- |',
    ...table,
    '',
  ].join('\n'),
);
await writeFile(
  path.join(root, 'apps/web/public/THIRD_PARTY_NOTICES.txt'),
  `${notices.join('\n')}\n`,
);
console.info(`已登记 ${rows.length} 个依赖项，汇总 ${seen.size} 个生产依赖的许可声明。`);
