# JHaven

**Your Quiet Haven, Every Night.**

每一个夜晚，都有一处属于你的宁静港湾。

JHaven 是以科学睡眠知识为基础，逐步融合环境音、睡前放松与睡眠习惯记录的 Web 应用。它不是医疗诊断或治疗软件，不保证入睡速度或治疗效果。

## 当前交付

当前版本为 `0.1.0-alpha.3`，处于 **Sprint 2.5 声音库 Alpha 阶段，账户与日记记录尚未开放**。

- 已实现：沉浸式首页、状态建议、十轨声音库与混音、独立音量、暂停/继续/停止、内置/本地自定义场景、计时/渐弱、跨页面控制、设置、About/404 与 API 检查。
- 本地存储：界面偏好、声音配比、总音量与自定义场景只存当前浏览器，不上传；今晚状态仅内存。刷新会取消播放与计时，不自动开声；没有假日记。
- 已建立：前后端分离工作区、严格类型检查、格式与静态检查、Vitest/API 测试、Playwright 桌面与移动冒烟测试。
- 声音库目前有 7 条 CC0 实录和 3 条项目自制音，支持搜索、分类、收藏与短试听。账户、MySQL、日记及引导待开发。 [声音用途与证据](docs/SOUND_EVIDENCE.md)

跨会话开发先读 [工程约定](AGENTS.md) 与 [项目状态](docs/PROJECT_STATUS.md)。源码和验证结果优先于状态摘要。仓库为 https://github.com/HendySen01/JHaven ，当前 main 跟踪 origin/main；本轮未提交或推送，操作见 [提交说明](docs/COMMIT_GUIDE.md)。

声音体验：进入「声音场景」，选择预设或手动混音，点击播放。可以另存到当前浏览器、设置定时与结束前渐弱；手机锁屏/后台行为取决于浏览器，不能保证。详见 [音频架构](docs/AUDIO_ENGINE.md) 与 [素材清单](docs/AUDIO_ASSETS.md)。

`npm run audio:verify` 校验音轨目录、质量和的来源字段、SHA-256、大小与格式；根构建前自动执行。常规安装不下载音频；重新制作只由维护者显式执行 `scripts/prepare-audio.mjs`。

## 环境与启动

使用 Node **24.12 以上的 24.x** 和 npm **11.x**。本次验证环境为 Node 24.21.0 / npm 11.19.0。Windows、macOS、Linux 使用相同 npm 命令；依赖在根目录安装，不在子目录重复安装。

```sh
npm ci
npm run dev
```

- 前端：[http://127.0.0.1:5173](http://127.0.0.1:5173)
- API：[http://127.0.0.1:3001/api/health](http://127.0.0.1:3001/api/health)
- 按 `Ctrl+C` 停止两端与共享包监听。若端口已被占用，启动会报错，不会静默切换。

**首次运行不需要环境文件、数据库或密钥。** 后端默认只绑定本机。自定义时复制 `apps/server/.env.example` 为同目录 `.env`；Node 原生加载该文件，Shell 已有变量优先。前端开发与预览代理默认指向 `127.0.0.1:3001`，改变 API 端口时同步修改 `apps/web/vite.config.ts`。

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
