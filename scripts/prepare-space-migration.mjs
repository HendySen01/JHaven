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
  '006_relaxation_sessions.sql',
];
const [mode, instanceFingerprint, ...extra] = process.argv.slice(2);
const sprint5 = mode === '--sprint5';
const catchUp = mode === '--catch-up';
if (
  (mode && !sprint5 && !catchUp) ||
  (catchUp
    ? !/^[a-f0-9]{12}$/.test(instanceFingerprint ?? '') || extra.length
    : instanceFingerprint !== undefined)
)
  throw new Error(
    '用法：node scripts/prepare-space-migration.mjs [--sprint5 | --catch-up 实例指纹]',
  );
const historyCount = sprint5 ? 5 : 2;
const migrations = await Promise.all(
  names.map(async (name) => {
    const source = (await readFile(new URL(name, migrationDir), 'utf8')).replaceAll('\r\n', '\n');
    const checksum = createHash('sha256').update(source).digest('hex');
    return { name, source, checksum };
  }),
);
const target = migrations.slice(historyCount, sprint5 || catchUp ? 6 : 5).map((migration) => {
  const { name, source } = migration;
  const table = name.slice(4, -4);
  if (
    !source.startsWith(`CREATE TABLE IF NOT EXISTS ${table} (`) ||
    !source.trimEnd().endsWith(';') ||
    (source.match(/;/g) ?? []).length !== 1
  )
    throw new Error(`迁移超出已审核的单表新增范围：${name}`);
  return { ...migration, table };
});
const newTableNames = target.map(({ table }) => `'${table}'`).join(',');
const blocks = target.map(({ name, source, checksum }) => {
  return `-- ${name}\n${source.trim().replace('CREATE TABLE IF NOT EXISTS', 'CREATE TABLE')}\nINSERT INTO schema_migrations (name, checksum, applied_at)\nVALUES ('${name}', '${checksum}', UTC_TIMESTAMP(3));`;
});
const historyPredicate = (entries) =>
  entries
    .map(({ name, checksum }) => `(name='${name}' AND checksum='${checksum}')`)
    .join(' OR\n    ');
const history = historyPredicate(migrations.slice(0, historyCount));
const filename = catchUp
  ? 'jhaven-003-006-navicat.review.sql'
  : sprint5
    ? 'sprint5-navicat.review.sql'
    : 'sprint4-navicat.review.sql';
const sql = catchUp
  ? catchUpSql()
  : `-- JHaven Navicat 审核脚本。请启用遇错停止，不并行运行其他迁移。
-- 先单独执行预检，确认 expected_history=${historyCount}、total_history=${historyCount}、new_tables=0。
-- 预检异常或部分执行后须调查现有结构，禁止直接重跑整段。
USE jhaven;
SELECT DATABASE() AS target_schema,
  (SELECT COUNT(*) FROM schema_migrations WHERE
    ${history}) AS expected_history,
  (SELECT COUNT(*) FROM schema_migrations) AS total_history,
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()
    AND TABLE_NAME IN (${newTableNames})) AS new_tables;

-- 预检通过后分块执行。MySQL DDL 隐式提交；每块成功建表后才登记记录。
${blocks.join('\n\n')}

SELECT name, checksum FROM schema_migrations ORDER BY name;
`;

function catchUpSql() {
  const knownHistory = historyPredicate(migrations);
  const preview = `SELECT DATABASE() AS target_schema, VERSION() AS mysql_version, @@port AS server_port,
  LEFT(SHA2(@@server_uuid, 256), 12) AS instance_fingerprint,
  (SELECT COUNT(*) FROM jhaven.schema_migrations WHERE applied_at IS NOT NULL AND (${history})) AS expected_history,
  (SELECT COUNT(*) FROM jhaven.schema_migrations) AS total_history,
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='jhaven'
    AND TABLE_NAME IN (${newTableNames})) AS new_tables;`;
  const steps = target.map(({ name, table, source, checksum }) => {
    const ddl = source
      .trim()
      .slice(0, -1)
      .replace(`CREATE TABLE IF NOT EXISTS ${table}`, `CREATE TABLE jhaven.${table}`)
      .replaceAll(/REFERENCES (users|sound_presets) \(/g, 'REFERENCES jhaven.$1 (')
      .replaceAll("'", "''");
    return `-- ${name}
SET @jh_ddl = IF(@jh_ready = 1, '${ddl}', 'DO 0');
PREPARE jh_migration FROM @jh_ddl;
EXECUTE jh_migration;
SET @jh_ready = (@jh_ready = 1 AND @@error_count = 0);
DEALLOCATE PREPARE jh_migration;
INSERT INTO jhaven.schema_migrations (name, checksum, applied_at)
SELECT '${name}', '${checksum}', UTC_TIMESTAMP(3) WHERE @jh_ready = 1;
SET @jh_ready = (@jh_ready = 1 AND @@error_count = 0);
SELECT JSON_EXTRACT(IF(@jh_ready = 1, '{"ok":true}', 'JHaven migration failed'), '$') AS step_check;`;
  });
  return `-- JHaven 003–006 Navicat 审核 SQL（MySQL 9.6.0）
-- 用专用管理员连接选中 jhaven。保留自动提交和外键检查，开启遇错停止，不并行运行其他迁移。
-- 先单独执行以下预检。预期 jhaven、9.6.0、3306、${instanceFingerprint}、2、2、0。
${preview}

-- 从这里到 RELEASE_LOCK 必须使用同一连接。使用与应用迁移器相同的锁。
-- 正式执行前备份并验证可恢复。DDL 会隐式提交，遇错关闭连接并复核，禁止直接重跑。
SET @jh_ready = 0;
SET @jh_target = COALESCE(DATABASE() = 'jhaven' AND @@port = 3306
  AND VERSION() = '9.6.0' AND LEFT(SHA2(@@server_uuid, 256), 12) = '${instanceFingerprint}'
  AND @@session.autocommit = 1 AND @@session.foreign_key_checks = 1, 0);
SET @jh_lock_name = CONCAT('jhaven:', LEFT(SHA2('jhaven', 256), 48));
SET @jh_lock = IF(@jh_target = 1, GET_LOCK(@jh_lock_name, 10), 0);
SET @jh_ready = COALESCE(@jh_target = 1 AND @jh_lock = 1
  AND IS_USED_LOCK(@jh_lock_name) = CONNECTION_ID()
  AND (SELECT COUNT(*) FROM jhaven.schema_migrations) = 2
  AND (SELECT COUNT(*) FROM jhaven.schema_migrations WHERE applied_at IS NOT NULL AND (${history})) = 2
  AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='jhaven'
    AND TABLE_NAME IN (${newTableNames})) = 0
  AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='jhaven'
    AND TABLE_NAME IN ('users','auth_sessions','schema_migrations') AND ENGINE='InnoDB') = 3, 0);
-- 守卫失败会报错，且会话标记保持为 0，后续语句不建表、不登记。
SELECT JSON_EXTRACT(IF(@jh_ready = 1, '{"ok":true}', 'JHaven preflight failed'), '$') AS preflight_guard;

${steps.join('\n\n')}

SELECT IF(@jh_lock = 1, RELEASE_LOCK(@jh_lock_name), NULL) AS lock_released;

-- 执行后验收（可在新连接单独运行）。预期历史匹配 6 / 总数 6，四张业务表均为 InnoDB。
SELECT name, checksum, applied_at FROM jhaven.schema_migrations ORDER BY name;
SELECT (SELECT COUNT(*) FROM jhaven.schema_migrations WHERE applied_at IS NOT NULL AND (${knownHistory})) AS matched_history,
       (SELECT COUNT(*) FROM jhaven.schema_migrations) AS total_history,
       (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='jhaven'
         AND TABLE_NAME IN (${newTableNames}) AND ENGINE='InnoDB') AS expected_tables;
${target.map(({ table }) => `SHOW CREATE TABLE jhaven.${table};`).join('\n')}
`;
}
await mkdir(artifactDir, { recursive: true });
await writeFile(new URL(filename, artifactDir), sql, 'utf8');
console.info(`已生成 artifacts/${filename}，数据库未连接。`);
