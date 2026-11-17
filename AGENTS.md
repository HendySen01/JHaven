# JHaven 工程说明

## 目标与范围

- 打造适合夜晚使用的睡眠习惯与放松 Web 应用，标语为 `Your Quiet Haven, Every Night.`。
- 当前为 Sprint 1 场景与交互预览。首页、状态建议、场景详情与本地界面偏好可用；真实音频、日记记录、账户、数据库和 AI 均未实现。具体状态以 `docs/PROJECT_STATUS.md` 与 `docs/ROADMAP.md` 为准。
- 未完成能力必须标为「待开发」，不能伪造播放、记录、成功提示或用户数据。
- 不宣称诊断、治疗失眠、临床效果或保证入睡，不默认向第三方发送私人内容。

## 技术与目录

- Node 24、npm workspaces；前端 Vue 3 + Vite + TypeScript + Router + Pinia + Tailwind + Lucide；后端 Express + TypeScript + Zod。
- `apps/web/src/components` 放可复用组件，`views` 放页面，`stores` 放跨组件状态，`lib` 放独立逻辑。
- `apps/server/src` 放服务代码；未来按业务模块组织路由、服务和数据访问。`packages/shared` 只放两端共用契约，不引入 Node 或 DOM 专属代码。
- Vue 使用 `<script setup lang="ts">`；优先原生语义元素、明确的 props/emits 和局部状态。所有按钮必须有真实操作。
- 界面遵循 `docs/DESIGN_SYSTEM.md`：响应式、键盘可用、可见焦点、触屏目标、减少动态效果、禁止自动播放。

## 数据与安全

- MySQL 方案详见 `docs/DATABASE.md`，尚无数据库实现；未需要前不安装驱动或编造迁移。
- 实现数据库时使用版本化迁移、参数化 SQL、外键和索引；所有私人资源查询同时约束资源 ID 与已认证用户 ID。
- 事件时间存 UTC；日记所属日期按用户选择的本地日期保存，记录 IANA 时区。禁止用 UTC 日期替代本地日记日期。
- 环境变量启动时校验，接口服务端校验并使用统一错误响应；不输出堆栈、密钥或私人正文。密钥只存环境配置。
- 开放私人数据前必须完成安全密码哈希、HttpOnly/Secure/SameSite Cookie、CSRF 防护、限流、权限隔离及删除流程，禁止使用 localStorage 保存认证令牌。
- 评估每个依赖的必要性、维护状况及许可证。第三方组件逐项核查来源、Vue 支持、依赖、素材权利、修改和产品化授权，写入 `docs/THIRD_PARTY.md`；许可不清楚时独立实现。

## 验证与交付

- 每次开发任务开始先读取本文件与 `docs/PROJECT_STATUS.md`，再按任务读取相关文档；检查 Git 状态、相关源码与已安装依赖。
- `PROJECT_STATUS.md` 是跨会话状态摘要，不是代码替代品；实际源码与验证结果始终优先，发现不一致先修正文档。
- 每次开发任务结束更新状态文档的功能、技术决策、Bug、真实测试、下一阶段、最近开发记录与版本；小改动只更新相关内容，避免重复日志。
- 状态文档记录版本、阶段与已确认的 Git 信息，不强制填写本次尚未生成的 Commit Hash；提交历史用 `git log` 核对。

- 修改前检查目录、适用约定与 Git 状态，保留已有未提交修改；不得回退或覆盖用户工作。
- 相关修改完成后运行 `npm run check`；页面或导航改动运行 `npm run test:e2e`。行为测试覆盖真实风险、异常和权限，不为样式细节堆砌测试。
- 新环境先 `npm ci`；E2E 需要 `npx playwright install chromium`。不得将未执行或失败的检查报告为通过。
- 启动 `npm run dev`；共享包先构建再启动两端。发布步骤详见 `docs/DEPLOYMENT.md`，不使用开发服务器作为生产服务器。
- 开发总结、文档、注释和用户文案使用简体中文；品牌标语与必要标识符保留原文。
- 同步更新相关设计、安全、数据库及开发阶段文档；有可用功能变化时更新 `docs/CHANGELOG.md`。
- Conventional Commits；未经明确要求不 commit、push 或生产部署，不删除重要数据，不新增无必要的基础设施。
- 收尾检查 `git status` 与 diff（未跟踪文件也须审查），排除密钥、隐私和无关文件，提供 Commit 建议与匹配当前分支的命令；不使用 `git add .` 盲目暂存。
