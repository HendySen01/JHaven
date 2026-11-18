// 仅生成供管理员审核的 SQL 文件，不连接数据库。
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const migrationDir = new URL('../apps/server/migrations/', import.meta.url);
const artifactDir = new URL('../artifacts/', import.meta.url);
const names = [
  '001_users.sql',
  '002_auth_sessions.sql',
  '003_sound_presets.sql',
  '004_sleep_diaries.sql',
  '005_user_preferences.sql',
];
const migrations = await Promise.all(
  names.map(async (name) => {
    const source = (await readFile(new URL(name, migrationDir), 'utf8')).replaceAll('\r\n', '\n');
    const checksum = createHash('sha256').update(source).digest('hex');
    return { name, source, checksum };
  }),
);
const blocks = migrations.slice(2).map(({ name, source, checksum }) => {
  if (
    !/^CREATE TABLE IF NOT EXISTS (sound_presets|sleep_diaries|user_preferences) \(/.test(source) ||
    (source.match(/;/g) ?? []).length !== 1
  )
    throw new Error(`迁移超出已审核的单表新增范围：${name}`);
  return `-- ${name}\n${source.trim().replace('CREATE TABLE IF NOT EXISTS', 'CREATE TABLE')}\nINSERT INTO schema_migrations (name, checksum, applied_at)\nVALUES ('${name}', '${checksum}', UTC_TIMESTAMP(3));`;
});
const sql = `-- Sprint 4 Navicat 审核脚本。请启用遇错停止，不并行运行其他迁移。
-- 先单独执行预检，确认 expected_history=2、total_history=2、new_tables=0。
-- 预检异常或部分执行后须调查现有结构，禁止直接重跑整段。
USE jhaven;
SELECT DATABASE() AS target_schema,
  (SELECT COUNT(*) FROM schema_migrations WHERE
    (name='${migrations[0].name}' AND checksum='${migrations[0].checksum}') OR
    (name='${migrations[1].name}' AND checksum='${migrations[1].checksum}')) AS expected_history,
  (SELECT COUNT(*) FROM schema_migrations) AS total_history,
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()
    AND TABLE_NAME IN ('sound_presets','sleep_diaries','user_preferences')) AS new_tables;

-- 预检通过后分块执行。MySQL DDL 隐式提交；每块成功建表后才登记记录。
${blocks.join('\n\n')}

SELECT name, checksum FROM schema_migrations ORDER BY name;
`;
await mkdir(artifactDir, { recursive: true });
await writeFile(new URL('sprint4-navicat.review.sql', artifactDir), sql, 'utf8');
console.info('已生成 artifacts/sprint4-navicat.review.sql，数据库未连接。');
