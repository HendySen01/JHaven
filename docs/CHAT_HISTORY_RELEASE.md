# 聊天历史 007 正式发布清单

维护者已通过 Supabase SQL Editor 完成生产只读预检。根据其反馈，PostgreSQL 17.12，执行和会话角色及既有对象所有者均为 `postgres`。001–006 校验一致，007 尚未登记，三张聊天表及四个预期索引均不存在，受限运行角色符合预期。生产备份、007 执行和后验收仍待确认。

本轮已用隔离 PostgreSQL 17.6 和严格 TLS 运行下方验收 SQL。七条记录、三张新表、四个索引、运行授权及旧版账户就绪查询均通过。

## 预检和备份

### SQL Editor 路径

在同一生产项目进入 **Database → Backups**，核对备份或 PITR 恢复点的状态、UTC 时间、可用恢复范围及操作者权限。确认可接受该恢复点之后的写入损失。可恢复到独立项目时，优先在那里检查迁移登记与原有业务表。避免点击生产项目的 Restore。 [Supabase 备份](https://supabase.com/docs/guides/platform/backups) · [恢复到独立项目](https://supabase.com/docs/guides/platform/clone-project)

没有可用的托管恢复点时，可请已有安全维护连接的授权管理员在受控环境导出 `jhaven`。沿用可信 CA 和 `sslmode=verify-full`，在加密位置保存备份和验证清单，并在独立目标恢复。导出命令见下文。本机无需配置 PostgreSQL 连接或 CA。若没有这样的维护环境，可先评估启用托管备份的成本，并等可用恢复点出现。不要以 Table Editor CSV 或 SQL Editor 查询结果代替备份。恢复时还须能重新配置自定义角色及其密码。

备份确认前保持只读。备份获确认后，在同一生产项目整段使用 [007 SQL Editor 事务脚本](sql/jhaven-007-supabase.sql)。脚本会在任何更改前核对角色、所有者、原六条登记和对象冲突。任何步骤出错都回滚。重复提交会明确停止，已登记时改用验收脚本。

执行成功后，运行 [007 只读验收 SQL](sql/jhaven-007-verify.sql)。预期七条登记、007 checksum 匹配，三张表由 `postgres` 所有。设置表有 3 列，会话表及消息表各有 6 列，四个索引有效。核对外键级联、检查约束和对应列默认值。运行角色仅有下列三组权限，三张表的 `runtime_grant_options` 均为空，schema CREATE 与迁移表访问均为 false。备份确认和生产执行须由维护者分别记录。

### 维护连接路径

1. 在 Vercel 确认当前生产部署的 Git SHA、同源域名和 Supabase 项目。记录可回滚的部署 ID。使用独立维护角色、Direct 连接或 Session pooler 5432，启用主机名验证及 Supabase CA。避免误用 Preview 或运行连接。
2. 用下方只读查询核对 PostgreSQL 版本、TLS 和迁移历史。预期已有 001–006 且 SHA-256 与发布源码一致。007 未登记时三张新表都应不存在。遇到部分结构、未知版本或校验不符，停止并调查。
3. 确认可恢复的 Supabase 管理备份或 PITR 时间点。额外使用已配置 `sslmode=verify-full` 的 libpq 维护服务，执行 `pg_dump --dbname=service=jhaven_production_maintenance --format=custom --schema=jhaven --file=jhaven-before-007.dump`。备份含私人数据，保存于加密、访问受限的位置。用 `pg_restore --list jhaven-before-007.dump` 核对清单，并在独立目标中演练恢复和账户访问。 [Supabase 备份](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

## 应用发布顺序

1. 在独立 Preview 数据库执行 007 和权限授权，验收应用。正式执行获准后，维护环境通过 `MIGRATION_DATABASE_URL` 和 `DATABASE_CA_PEM` 运行 `npm run db:migrate`。Vercel 仅持有运行配置。
2. 以表所有者执行下列新增运行权限。脚本重复执行安全。保留现有授权，确保应用角色没有 DDL、授权权限或迁移表访问。不要将 `jhaven` 加入 Supabase Data API。
3. 运行下方只读验收 SQL，核实 007、约束、索引和权限。必要时确认旧服务的健康、账户和原有个人空间路径。迁移只新增表与索引，旧版应用的表、字段、查询、会话和数据均保持兼容。新外键引用 `users`，迁移时可能短暂与写入竞争，安排低流量窗口。
4. 发布代码经授权后再推送，注意生产分支可能自动上线。先确保正式库迁移和授权完成，再验收和推广 Vercel 生产构建。用专用测试账户验证登录、历史列表和私有访问边界。使用 iOS 15.6 复测历史和助手。 [Vercel 发布与推广](https://vercel.com/docs/deployments/promoting-a-deployment)

```sql
BEGIN;
GRANT SELECT, INSERT, UPDATE ON jhaven.chat_history_settings TO jhaven_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON jhaven.chat_conversations TO jhaven_app;
GRANT SELECT, INSERT, DELETE ON jhaven.chat_messages TO jhaven_app;
COMMIT;
```

## 只读验收 SQL

由能读取迁移登记的维护角色执行。七条校验和应与发布源码按 LF 计算的 SHA-256 一致。007 的校验和为 `6b4775be7ca64231592f975e07dc8675f413cf60c57ca744e6be727ef5bbc596`。预检仅执行前两条查询以及表名查询。验收预期三张表均存在，`idx_chat_recent` 以用户和更新时间排序，消息复合外键级联删除。

```sql
BEGIN READ ONLY;
SELECT current_database(), current_user, current_setting('server_version') AS version,
       ssl, s.version AS tls_version
FROM pg_stat_ssl AS s WHERE pid = pg_backend_pid();
SELECT name, checksum, applied_at FROM jhaven.schema_migrations ORDER BY name;
SELECT tablename FROM pg_tables
WHERE schemaname = 'jhaven' AND tablename IN
  ('chat_history_settings', 'chat_conversations', 'chat_messages') ORDER BY tablename;
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'jhaven' AND tablename IN
  ('chat_history_settings', 'chat_conversations', 'chat_messages') ORDER BY tablename, indexname;
SELECT conrelid::regclass AS relation, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid IN
  ('jhaven.chat_history_settings'::regclass, 'jhaven.chat_conversations'::regclass,
   'jhaven.chat_messages'::regclass) ORDER BY 1, 2;
SELECT t.table_name, p.privilege,
       has_table_privilege('jhaven_app', 'jhaven.' || t.table_name, p.privilege) AS allowed
FROM (VALUES ('chat_history_settings'), ('chat_conversations'), ('chat_messages')) AS t(table_name)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) AS p(privilege)
ORDER BY t.table_name, p.privilege;
SELECT has_schema_privilege('jhaven_app', 'jhaven', 'USAGE') AS can_use,
       has_schema_privilege('jhaven_app', 'jhaven', 'CREATE') AS can_create,
       has_table_privilege('jhaven_app', 'jhaven.schema_migrations', 'SELECT') AS can_read_history;
ROLLBACK;
```

ACL 验收应与授权清单一致，三个 TRUNCATE 均为 false，末条为 true / false / false。可另用受限角色发起三条 `SELECT … LIMIT 0` 确认连通。历史数据隔离由 Express 会话与账户 ID 条件保证，Preview 用两个账户分别验证列表、内容搜索和按 ID 访问。

## 回滚

- 迁移未提交时，现有迁移器回滚事务。若 DDL 成功但授权或发布失败，保留 007 和数据，修复授权或切回上一版 Vercel 部署。无需撤销已登记迁移。
- 发布后出现回归时，在 Vercel 选择可回滚的已知正常生产部署。回滚会恢复该部署对应的配置；确认环境差异。旧应用忽略新聊天表。应用回滚不丢弃新保存的会话。仅在确认数据库损坏且有单独恢复授权时才从备份恢复，避免覆盖备份之后的生产写入。 [Vercel Instant Rollback](https://vercel.com/docs/instant-rollback)
