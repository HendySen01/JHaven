# JHaven

**Your Quiet Haven, Every Night.**

每一个夜晚，都有一处属于你的宁静港湾。

JHaven 是以科学睡眠知识为基础，逐步融合环境音、睡前放松与睡眠习惯记录的 Web 应用。它不是医疗诊断或治疗软件，不保证入睡速度或治疗效果。

## 当前交付

当前版本为 `0.1.0-alpha.6`，进入 **Sprint 5 放松引导 Alpha**。访客可直接使用声音库与四项放松练习；账户放松记录需要 MySQL 迁移至 006。

- 已实现：沉浸式首页、状态建议、十轨声音库与混音、独立音量、暂停/继续/停止、内置/本地自定义场景、计时/渐弱、跨页面控制、设置、About/404 与 API 检查。
- 设备存储：界面偏好、设备声音配比、总音量与本地预设留在当前浏览器，只有主动导入才上传所选场景。今晚状态仅存内存。刷新不会自动播放。
- 已建立：前后端分离工作区、严格类型检查、格式与静态检查、Vitest/API 测试、Playwright 桌面与移动冒烟测试。
- 声音库目前有 7 条 CC0 实录和 3 条项目自制音，支持搜索、分类、收藏与短试听。账户支持预设、默认播放设置、私人日记与趋势，以及用户主动保存的放松记录。 [声音用途与证据](docs/SOUND_EVIDENCE.md) [放松练习依据](docs/RELAXATION_EVIDENCE.md)

跨会话开发先读 [工程约定](AGENTS.md) 与 [项目状态](docs/PROJECT_STATUS.md)。源码和验证结果优先于状态摘要。仓库为 https://github.com/HendySen01/JHaven ，当前 main 跟踪 origin/main；本轮建议分两次提交，操作见 [提交说明](docs/COMMIT_GUIDE.md)。

声音体验：进入「声音场景」，选择预设或手动混音，点击播放。可以另存到当前浏览器、设置定时与结束前渐弱；手机锁屏/后台行为取决于浏览器，不能保证。详见 [音频架构](docs/AUDIO_ENGINE.md) 与 [素材清单](docs/AUDIO_ASSETS.md)。

`npm run audio:verify` 校验音轨目录、数字质量与来源字段、SHA-256、大小与格式；根构建前自动执行。常规安装不下载音频；重新制作只由维护者显式执行 `scripts/prepare-audio.mjs`。

## 环境与启动

使用 Node **24.12 以上的 24.x** 和 npm **11.x**。本次验证环境为 Node 24.21.0 / npm 11.19.0。Windows、macOS、Linux 使用相同 npm 命令；依赖在根目录安装，不在子目录重复安装。

```sh
npm ci
npm run dev
```

- 前端：[http://127.0.0.1:5173](http://127.0.0.1:5173)
- API：[http://127.0.0.1:3001/api/health](http://127.0.0.1:3001/api/health)
- 按 `Ctrl+C` 停止两端与共享包监听。若端口已被占用，启动会报错，不会静默切换。

访客声音库可直接启动。启用注册与登录前，请创建专用 MySQL 数据库及数据库账号，按以下顺序操作。

```powershell
Copy-Item apps/server/.env.example apps/server/.env
# 编辑 apps/server/.env，填入 DB_HOST、DB_NAME、DB_USER、DB_PASSWORD
npm run db:migrate
npm run dev
```

仅在本地尚无 `.env` 时复制示例。首次迁移需要目标库的建表和索引权限，生产部署使用单独迁移账号。运行时账户须能读写会话与用户记录。默认 `APP_ORIGIN=http://127.0.0.1:5173`，浏览器应访问这一来源。生产配置使用实际 HTTPS 来源。数据库错误会写入启动提示，`/api/auth/status` 返回 503。数据库与 Cookie 配置见 [账户与会话](docs/AUTH.md)。从 Sprint 3 升级正式库时，按 [个人空间](docs/PERSONAL_SPACE.md) 先审核 Navicat 迁移。

服务 API 改端口时，同步设置 `PORT` 和 `JHAVEN_PROXY_PORT`。测试端口冲突时，可用 `PLAYWRIGHT_API_PORT` 选择专用端口。数据库测试需要已创建的 `jhaven_test_` 前缀隔离库及其凭据，并显式设置 `JHAVEN_TEST_MYSQL=1`。测试环境使用独立配置，详情见 [验证记录](docs/TESTING.md)。

`npm run dev` 会先构建共享包。单独使用 `npm run dev:web` 或 `npm run dev:server` 前先运行 `npm run build -w @jhaven/shared`；单独启动前端时，服务检查会显示连接失败，符合真实状态。

## 常用命令

| 命令                                      | 用途                                                       |
| ----------------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                             | 同时启动共享包监听、API 和前端热更新                       |
| `npm run typecheck`                       | 检查共享包、后端、Vue、测试与工具配置                      |
| `npm run lint`                            | ESLint，警告也视为失败                                     |
| `npm run format` / `npm run format:check` | 格式化 / 检查格式                                          |
| `npm test`                                | Vitest 单元与 API 集成测试                                 |
| `npm run check`                           | 格式、Lint、类型、单元/API、构建顺序检查                   |
| `npx playwright install chromium`         | 首次安装 E2E 所需浏览器                                    |
| `npm run test:e2e`                        | 构建后自动启动 API 与静态预览，执行桌面/移动 Chromium 测试 |
| `npm run build`                           | 按共享包 → API → 前端顺序构建                              |
| `npm start`                               | 启动构建后的 API                                           |
| `npm run preview`                         | 本地验证前端构建产物，不用于生产服务                       |

Linux CI 安装浏览器时使用 `npx playwright install --with-deps chromium`。E2E 使用 3001 和 4173 端口，为避免误测其他进程，不复用已有服务；运行前停止占用这些端口的进程。网络受限环境需要允许 npm registry 与 Playwright 官方下载域名。

若浏览器下载不可用，可显式选择已安装的系统 Chrome：PowerShell 中先设置 `$env:PLAYWRIGHT_CHANNEL='chrome'`，再运行 `npm run test:e2e`，完成后 `Remove-Item Env:PLAYWRIGHT_CHANNEL`。测试覆盖 375px、768px、1440px；实际结果与浏览器来源见 [验证记录](docs/TESTING.md)。

## 文件结构

```text
JHaven/
├── apps/
│   ├── web/                 # Vue 页面、组件、状态与样式
│   └── server/              # Express API、环境校验、统一错误处理
├── packages/shared/        # 两端共享的类型、应用信息和健康检查契约
├── tests/e2e/              # Playwright 桌面与移动测试
├── deploy/nginx.conf       # 自托管反向代理示例
├── docs/                   # 产品、架构、设计、安全、路线与验证记录
├── AGENTS.md               # 后续开发必须遵守的工程约定
├── package.json
└── package-lock.json       # 固定依赖树，使用 npm ci 复现
```

构建产物位于 `apps/web/dist`、`apps/server/dist`、`packages/shared/dist`，均不提交 Git。详细本地及发布步骤见 [部署说明](docs/DEPLOYMENT.md)，验证范围见 [测试说明](docs/TESTING.md)。

## 项目文档

- [产品需求](docs/PRD.md) · [架构决策](docs/ARCHITECTURE.md) · [设计系统](docs/DESIGN_SYSTEM.md)
- [数据库设计](docs/DATABASE.md) · [安全与内容边界](docs/SAFETY.md)
- [第三方来源与许可证](docs/THIRD_PARTY.md) · [阶段计划](docs/ROADMAP.md) · [变更记录](docs/CHANGELOG.md)

尚未为 JHaven 自有代码选择开源许可证；根包标记为 `UNLICENSED`，不代表第三方依赖不可使用。第三方继续适用各自许可证。未经明确要求不 commit、push 或部署生产环境。
