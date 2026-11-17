# 数据库设计草案

**状态：设计阶段。尚未安装 MySQL 驱动、创建表或运行迁移。** 不把以下实体描述为已经可用；不在初始化阶段加入空迁移充当实现。

## 约定

计划使用 MySQL 8.4 LTS、InnoDB、utf8mb4。上线前核对目标版本与托管条件。主键采用无业务含义的 `BIGINT UNSIGNED` 自增值，API 以字符串序列化，防止 JavaScript 整数精度损失。

所有事件时间用 UTC `DATETIME(3)`，连接会话时区设为 `+00:00`。日记日期为用户选定的本地 `DATE`，另存当时 IANA 时区（如 `Asia/Macau`）；用户更改时区不追溯移动旧日记日期。不得依靠运行主机时区决定记录归属。

## 计划实体

| 表                  | 核心字段（草案）                                                                                       | 约束与索引                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| users               | id、email、password_hash、created_at、updated_at                                                       | PK(id)，唯一规范化 email；不存明文密码                                                  |
| sleep_diaries       | id、user_id、entry_date、timezone、bedtime_at?、wake_at?、rest_quality?、note?、created_at、updated_at | FK(user_id) → users，唯一(user_id, entry_date)；按用户日期范围查询                      |
| sound_presets       | id、user_id、name、tracks(JSON)、created_at、updated_at                                                | FK(user_id) → users，INDEX(user_id, updated_at)；tracks 仅允许白名单音轨 ID 与 0–1 音量 |
| relaxation_sessions | id、user_id、guide_key、started_at、ended_at?、completion_state                                        | FK(user_id) → users，INDEX(user_id, started_at)；不记录思绪自由文本                     |
| user_preferences    | user_id、timezone、default_volume、reduce_motion、updated_at                                           | PK/FK(user_id) → users，严格范围与枚举校验                                              |

`?` 代表可选。日记主观感受可留空，只作个人描述，不生成健康评分。时间填写不全时不推算睡眠时长；床上时间不等同实际睡眠时长。自由文本拟限制 2000 字符，禁止保存不必要的诊断或身份信息。

内置声音预设与审核引导优先为版本化静态配置，不提前增加公共内容表。会话只在用户主动启动引导时保存必要完成状态，不以追踪之名自动记录行为。

## 迁移与访问

数据阶段在 `apps/server/migrations/` 引入递增、不可改写的 SQL 迁移及迁移执行器，记录版本与校验和。迁移须单独显式执行，运行应用不自动修改生产结构；MySQL DDL 常有隐式提交，不能宣称可事务回滚全部迁移。破坏性变更先备份、验证恢复并获得用户明确要求。

采用参数化 SQL，表名/排序字段只能来自服务端白名单。所有读、改、删同时限定 `id` 与已认证 `user_id`，不信任客户端传入的所有者 ID；日记列表限制分页大小并按日期范围查询。测试至少覆盖用户 A 无法读改删用户 B 的每类私人资源。

## 删除与数据生命周期

子表外键使用 `ON DELETE CASCADE`，账号删除前提供明确的范围说明；删除当前用户后相关会话应同时失效。单条日记支持真实删除，不把隐藏视为删除。默认不实现无期限软删除或正文审计副本。

备份的保存周期、删除滞后、导出格式与恢复演练需在朋友内测前确定并披露。新增认证若需要独立会话表，应由会话方案决定并记录理由；当前不提前新增此表。
