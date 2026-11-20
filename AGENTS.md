# JHaven 工程说明

## 目标与范围

- 打造适合夜晚使用的睡眠习惯与放松 Web 应用，标语为 `Your Quiet Haven, Every Night.`。
- 声音库提供自然实录和稳定背景音。新增声音须分别核查用途证据、许可和数字音质。当前功能及待办以 `docs/PROJECT_STATUS.md` 与 `docs/ROADMAP.md` 为准。
- 未完成能力必须标为「待开发」，不能伪造播放、记录、成功提示或用户数据。
- 不宣称诊断、治疗失眠、临床效果或保证入睡，不默认向第三方发送私人内容。

## 技术与目录

- Node 24、npm workspaces；前端 Vue 3 + Vite + TypeScript + Router + Pinia + Tailwind + Lucide；后端 Express + TypeScript + Zod。
- `apps/web/src/components` 放可复用组件，`views` 放页面，`stores` 放跨组件状态，`lib` 放独立逻辑。
- `apps/server/src` 放服务代码；未来按业务模块组织路由、服务和数据访问。`packages/shared` 只放两端共用契约，不引入 Node 或 DOM 专属代码。
- Vue 使用 `<script setup lang="ts">`；优先原生语义元素、明确的 props/emits 和局部状态。所有按钮必须有真实操作。
- 音频由应用级单一引擎管理，组件不得各自创建 Context；维护意图版本号、可取消包络及 pagehide/根卸载释放。路由切换保留播放，刷新不恢复播放或计时。详见 `docs/AUDIO_ENGINE.md`。
- 替换音轨前逐项核查作者/许可/再分发并更新 audio manifest、署名和资源文档，运行 `npm run audio:verify`。不能用 Mock 结果替代真实浏览器音频验证。
- 界面遵循 `docs/DESIGN_SYSTEM.md`：响应式、键盘可用、可见焦点、触屏目标、减少动态效果、禁止自动播放。

## 数据与安全

- PostgreSQL 承载账户及私人业务。通过 `npm run db:migrate` 用独立角色显式执行迁移，保留 MySQL 历史文件。运行时使用最小权限账号及严格 TLS。相关契约见 `docs/AUTH.md` 与 `docs/DATABASE.md`。
- 实现数据库时使用版本化迁移、参数化 SQL、外键和索引；所有私人资源查询同时约束资源 ID 与已认证用户 ID。
- 事件时间存 UTC；日记所属日期按用户选择的本地日期保存，记录 IANA 时区。禁止用 UTC 日期替代本地日记日期。
- 环境变量启动时校验，接口服务端校验并使用统一错误响应；不输出堆栈、密钥或私人正文。密钥只存环境配置。
- 开放私人数据前必须完成安全密码哈希、HttpOnly/Secure/SameSite Cookie、CSRF 防护、限流、权限隔离及删除流程，禁止使用 localStorage 保存认证令牌。
- 评估每个依赖的必要性、维护状况及许可证。第三方组件逐项核查来源、Vue 支持、依赖、素材权利、修改和产品化授权，写入 `docs/THIRD_PARTY.md`；许可不清楚时独立实现。

## 验证与交付

### 任务开始前

- 先读本文件和 `docs/PROJECT_STATUS.md`，再根据任务读取相关技术文档与目录约定。查看 `git status` 和已有未提交改动，核对相关源码、已安装依赖及项目实际进度。
- 项目状态文档用于跨会话衔接。实际源码和验证结果优先，发现不一致时修正记录。
- 按任务需要评估 GitHub 开源项目和 Skills。采用前核查许可证、兼容性、所需权限及执行脚本，第三方组件同时遵循上文的来源与授权规则。

### 开发与验证

- 修改完成后运行 `npm run check`，覆盖相关测试、类型检查、ESLint 和构建。页面或导航改动运行 `npm run test:e2e`。行为测试覆盖真实风险、异常和权限，不为样式细节堆砌测试。
- 修复本次修改引起的错误并重新验证。逐项如实报告失败或未执行的检查，必要测试未通过时不得宣称任务完成。
- 新环境先 `npm ci`。E2E 需要 `npx playwright install chromium`。
- 启动 `npm run dev`；共享包先构建再启动两端。发布步骤详见 `docs/DEPLOYMENT.md`，不使用开发服务器作为生产服务器。
- 开发总结、文档、注释和用户文案使用简体中文；品牌标语与必要标识符保留原文。
- 未经明确授权不进行生产部署。不得删除重要数据或新增无必要的基础设施。

### 任务完成后与提交前

- 每次开发任务收尾且在提交前维护 `docs/PROJECT_STATUS.md`，记录当前版本、阶段、已完成与未完成功能、技术决策、Bug、实际测试结果、下一阶段任务和最近开发记录。小改动只更新相关内容。提交历史及已生成的 Commit Hash 通过 `git log` 查询，状态文档无需提前记录本次尚未生成的 Hash。
- 同步更新相关设计、安全、数据库和开发阶段等技术文档。有可用功能变化时更新 `docs/CHANGELOG.md`。在 `docs/THIRD_PARTY.md` 记录实际采用的开源项目和 Skills 及其用途，区分评估与实际使用。
- 检查 `git status` 和 `git diff`，审查未跟踪文件及已有暂存内容，确认本次变更范围。排除 `.env`、密钥、私人信息、敏感文件和无关改动，保留用户已有的未提交修改，禁止覆盖、重置或丢弃。
- 仅建议暂存当前任务相关文件，不使用 `git add .` 盲目暂存。生成符合 Conventional Commits 的提交说明。提交与推送分别需要明确授权，获准自动提交后仍须另获授权才可推送。

### 结束汇报

- 简洁列出已完成内容、修改文件、实际测试结果、未解决问题、`docs/PROJECT_STATUS.md` 更新摘要、推荐 Commit 信息，以及匹配当前分支的提交和推送命令。
