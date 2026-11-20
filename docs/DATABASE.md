# 数据库

账户数据包括声音预设、私人睡眠日记、默认播放设置和自愿保存的放松记录。各类记录或设置可独立删除，账户级删除仍待开发。

## 约定

运行数据库为 PostgreSQL，目标托管服务为 Supabase。业务表全部在 `jhaven` schema，保持现有 API 与 Express 认证。用户主键为正数 `bigint` identity，API 始终序列化为字符串。MySQL 的历史库、迁移与校验记录单独保留。本次建立 PostgreSQL 结构，现有 MySQL 数据搬运不在范围内。

账户和练习时间用 `timestamptz(3)`，日记实际事件用 `timestamptz(0)`，API 输出 UTC。用户选定的本地 `DATE` 按 `YYYY-MM-DD` 回传，并单独保留 IANA 时区（例如 `Asia/Macau`）。会话摘要用 32 字节 `bytea`，预设用 `uuid` 与 `jsonb`。预设名称用 ICU 二级排序规则，同账户大小写不区分、重音保留。

## 已实现实体

| 表                  | 字段                                                          | 约束和索引                                                 |
| ------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| `users`             | `id`、`username`、`password_hash`、`created_at`、`updated_at` | 自增 ID、规范化 ASCII 用户名唯一、密码为版本化 scrypt 哈希 |
| `auth_sessions`     | `token_hash`、`user_id`、`created_at`、`expires_at`           | SHA-256 摘要主键、用户与过期索引、外键级联删除             |
| `schema_migrations` | `name`、`checksum`、`applied_at`                              | 文件名主键，SHA-256 校验和                                 |

私人业务表使用用户外键，删除账户时由数据库级联清理。

| 表                    | 数据与约束                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `sound_presets`       | UUID、用户、场景名、音轨 JSON。每用户名称唯一，大小写不区分，JSON 由共享音轨目录校验，音量为 0–100。      |
| `sleep_diaries`       | UUID、用户、日记日期、IANA 时区，以及可空的上床、入睡、醒来和休息感。备注最多 2000 字。每用户每日期一条。 |
| `user_preferences`    | 用户主键、默认内置或账户场景、音量和 0–180 分钟定时。事务内确认预设归属；删除预设后引用置空。             |
| `relaxation_sessions` | 账户与随机 ID、练习类型、实际秒数、完成状态和保存时间。复合主键，并按用户与时间索引。                     |

## 内容与记录

日记主观感受可留空，只作个人描述，不生成健康评分。时间填写不全时不推算睡眠时长。

内置声音预设与审核引导为版本化静态配置。仅用户在练习结束后主动点击保存才写入放松记录。

## 迁移与访问

运行 `npm run db:migrate` 会读取 `apps/server/migrations-postgres/` 的 001–006。执行器使用独立的 `MIGRATION_DATABASE_URL`，在同一事务加 PostgreSQL advisory xact 锁，核对已应用版本是完整前缀，并以 LF 计算 SHA-256。六个迁移和 `jhaven.schema_migrations` 合计七张表。未应用迁移的 DDL 与记录一起提交，失败后整体回滚。运行时不自动迁移。

迁移角色拥有 `jhaven` schema 和其中对象。平台管理员可先创建 schema 并指定迁移角色为所有者。由对象所有者在六份迁移完成后显式执行 [运行权限 SQL](../apps/server/migrations-postgres/runtime-grants.sql)。`jhaven_app` 只获得 schema USAGE、业务所需读写及用户 ID 序列 USAGE，无 DDL、授权或迁移记录访问权限。保持 `jhaven` 不在 Supabase Data API 的 Exposed schemas 中，Express 从 Cookie 解析用户身份后才访问私人行。

采用参数化 SQL，表名/排序字段只能来自服务端白名单。所有读、改、删同时限定 `id` 与已认证 `user_id`，不信任客户端传入的所有者 ID；日记列表按用户日期范围查询，最多 366 天，每天最多一条。测试至少覆盖用户 A 无法读改删用户 B 的每类私人资源。

## 删除与数据生命周期

子表外键使用 `ON DELETE CASCADE`，账号删除前提供明确的范围说明；删除当前用户后相关会话应同时失效。单条日记支持真实删除，不把隐藏视为删除。默认不实现无期限软删除或正文审计副本。

备份的保存周期、删除滞后、导出格式与恢复演练需在朋友内测前确定并披露。当前会话到期后立即拒绝认证，后续登录分批清除过期条目。可在成熟运维流程里补充定期清理，同时验证备份及恢复。

## MySQL 历史验收

以下记录对应既有 MySQL 环境及 `apps/server/migrations/`，用于追溯。Supabase 初始化采用上方 PostgreSQL 流程。

### Sprint 5 放松记录

`006_relaxation_sessions.sql` 新增 `relaxation_sessions`。使用账户和随机记录 ID 作为复合主键，按账户及 UTC 保存时间索引，用户删除时级联。仅保存练习枚举、实际秒数、完成状态和服务端保存时间。旧迁移保持原样。

生成管理员审核 SQL 使用 `node scripts/prepare-space-migration.mjs --sprint5`。在 Navicat 先执行预检，核对目标 `jhaven`、前五条迁移校验和、历史总数均为五且新表数为零。003–005 尚未登记时先处理 Sprint 4。启用遇错停止，按块执行 006 并核对迁移登记。生成过程不连接数据库，应用运行账号沿用现有授权。

### 迁移前的正式库核对

2026-11-18 按应用配置连接的 `jhaven` 仅有 001–002 两条迁移，校验和一致。003–006 的登记和四张新表均未找到。若 Navicat 显示已完成，先在管理员连接运行以下只读查询，比对实例指纹、端口和库名。库名应在查询前由管理员选定。

```sql
SELECT DATABASE() AS schema_name, @@port AS server_port,
       LEFT(SHA2(@@server_uuid, 256), 12) AS instance_fingerprint;

SELECT name, checksum, applied_at
FROM schema_migrations
ORDER BY name;
```

### 从 001–002 补齐 003–006

应用连接的实例指纹为 `357a9eeb7b4b`。Navicat 已确认 MySQL 版本、端口、库名和两条迁移记录与应用目标一致；执行前以上述查询比较 Navicat 的实际指纹。

| 迁移 | 新表                  | 外键依赖                                 |
| ---- | --------------------- | ---------------------------------------- |
| 003  | `sound_presets`       | 001 的 `users`                           |
| 004  | `sleep_diaries`       | 001 的 `users`                           |
| 005  | `user_preferences`    | 001 的 `users` 和 003 的 `sound_presets` |
| 006  | `relaxation_sessions` | 001 的 `users`                           |

在仓库根目录执行 `node scripts/prepare-space-migration.mjs --catch-up 357a9eeb7b4b`，生成 `artifacts/jhaven-003-006-navicat.review.sql`。生成器读取原迁移并以 LF 规范化后计算完整 SHA-256，与应用迁移器一致。审核 SQL 只创建四张表，逐张成功后向 `jhaven.schema_migrations` 插入对应登记。所有目标表和引用表都以 `jhaven` 限定，001–002 不重新登记。

1. 用具有建表、外键引用和迁移登记权限的独立管理员连接选中 `jhaven`，保持自动提交和外键检查开启。先单独运行文件开头的只读预检，核对 `jhaven`、`9.6.0`、`3306`、实例指纹、`expected_history=2`、`total_history=2`、`new_tables=0`。
2. 在执行前备份整个 `jhaven` 的表结构和数据，包括迁移记录。将备份放在仓库之外的受控位置，并在独立库验证可恢复。执行期间暂停其他迁移任务。
3. 在 Navicat 启用遇错停止，以同一连接运行文件。脚本使用与应用迁移器相同的命名锁，并在取锁后重新检查迁移历史、已有表和实例。如果某步失败，关闭连接以释放锁，先核对表结构与登记再制定恢复步骤。MySQL DDL 会隐式提交，成功建表与登记之间仍可能因中断留下部分状态。
4. 文件结尾含可单独运行的验收 SQL。确认 `matched_history=6`、`total_history=6`、`expected_tables=4`，逐条核对迁移的文件名、校验和、登记时间及四个 `SHOW CREATE TABLE` 结果。随后用应用账号做只读探针；个人数据写入与跨账户验收继续使用隔离库。

### 003–006 迁移后验收

2026-11-18，管理员通过 Navicat 完成 003–006 后，应用账号在 `jhaven` 的只读事务内确认实例指纹为 `357a9eeb7b4b`，六条登记均有应用时间且 SHA-256 与源码一致。四张业务表的完整 `SHOW CREATE TABLE` 与同版本、已验证迁移哈希的隔离参考库一致，包含列、索引、检查约束及外键删除策略。

正式库应用账号的四类业务读取探针均通过，使用带 `LIMIT 0` 的参数化查询。连接该库的本地应用健康及认证就绪为 200，匿名私人接口为 401。登录态业务写入及账户隔离在隔离库验收。 [测试记录](TESTING.md)
