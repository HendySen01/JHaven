# 本地运行与部署准备

## 当前状态

当前可构建为 Vue 静态资源与 Express API。账户和私人数据功能需要可达、已迁移的 PostgreSQL。Vercel 单项目配置保留，目标 Supabase 项目通过 Preview 后再上线。

静态部署保留 `apps/web/dist/audio` 内 16 条 WAV、清单与署名。音轨文件名沿用稳定 ID，部署示例允许浏览器重新验证缓存。若入口或 CDN 缓存过此前缺失资源的 404，发布时需清除这四条旧缓存。根构建校验哈希和数字质量。生产 Nginx 与 HTTPS 尚未实测。

## 安装与本地验证

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
```

本地开发用 `npm run dev`。构建产物验证可在两个终端分别运行：

```sh
npm start
```

```sh
npm run preview
```

访问 `http://127.0.0.1:4173`，再打开 `/about` 验证真实健康接口。`preview` 只用于本地验证，生产使用静态服务器。

## Vercel 单项目

在导入页将 Framework Preset 设为 **Services**，Root Directory 保持仓库根目录，Node.js 选择 **24.x**。构建和输出沿用仓库根的 `vercel.json`，保持 npm workspace 的根锁文件和 `packages/shared` 可用。Vite 服务构建 `apps/web/dist`，Express 服务构建共享包和后端并导出应用实例。 [Vercel Services 指南](https://vercel.com/kb/guide/vercel-services)

`/api` 与 `/api/*` 优先转给 Express，保留原路径。浏览器继续用相对路径访问 API，Cookie 与 Origin 校验保持同源。其余路径进入 Vite 服务，先匹配真实文件，页面路径回退到 `index.html`，缺失的音频或资源返回 404。静态前端无需内部 binding、额外 API 地址或 CORS 配置。 [服务路由](https://vercel.com/docs/services/routing)

### 环境变量

| 用途             | 变量与要求                                                                                                                                                                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 正式域名         | `APP_ORIGIN` 填浏览器使用的完整 HTTPS 来源，末尾无斜杠，不含路径。                                                                                                                                                                                                                                                             |
| Preview          | 默认使用 Vercel 注入的 `VERCEL_ENV` 与 `VERCEL_URL`。打开 Automatically expose System Environment Variables，并通过该次部署 URL 测试。如使用固定预览别名，给对应 Preview 环境单独设置 `APP_ORIGIN`。                                                                                                                           |
| 账户、日记与收藏 | `DATABASE_URL` 使用受限角色的 Supavisor Transaction pooler，`DATABASE_CA_PEM` 粘贴 Dashboard 下载的完整 CA PEM。Preview 使用独立项目或独立数据库。                                                                                                                                                                             |
| 可选 DeepSeek    | `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`AI_VERIFIED_DEEPSEEK_MODEL`、`DEEPSEEK_BASE_URL`。默认官方地址及 `deepseek-flash`，非默认模型须核对验收标记。                                                                                                                                                                           |
| 可选 OpenAI      | `AI_OPENAI_API_KEY`、`AI_OPENAI_MODEL`、`AI_VERIFIED_OPENAI_MODEL`、`AI_OPENAI_BASE_URL`。验收标记须与模型一致。                                                                                                                                                                                                               |
| 可选用量控制     | `AI_DAILY_REQUEST_LIMIT`、`AI_DAILY_BUDGET_USD`、`AI_ACCOUNT_WINDOW_LIMIT`、`AI_GUEST_WINDOW_LIMIT`、`AI_IP_WINDOW_LIMIT`，以及 `AI_DEEPSEEK_DAILY_REQUEST_LIMIT`、`AI_DEEPSEEK_DAILY_BUDGET_USD`、`AI_OPENAI_DAILY_REQUEST_LIMIT`、`AI_OPENAI_DAILY_BUDGET_USD`。计数按实例维护，公开启用付费模型前在平台和供应商侧配置额度。 |

密钥放在对应环境的服务端变量，不加 `VITE_` 前缀。Vercel 入口选择运行模式，无需填写 `HOST`、`PORT` 或 `TRUST_LOOPBACK_PROXY`。数据库地址须可从 Vercel Functions 访问，本机 `localhost` 或局域网地址不可用；迁移在发布流程中手动执行。

### Supabase 首次配置

1. 在 Supabase Dashboard 创建 JHaven 的独立项目。启用数据库 SSL Enforcement，下载 Database Settings → SSL Configuration 的 CA 公开证书。保持 `jhaven` schema 不对 Data API 开放。 [SSL Enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement)
2. 通过项目管理员的已验证 TLS 连接创建登录角色 `jhaven_owner` 和 `jhaven_app`。可用 `CREATE ROLE jhaven_owner LOGIN;` 与 `CREATE ROLE jhaven_app LOGIN;`，分别以 `psql` 的 `\password` 设置独立密码。由可切换到 `jhaven_owner` 的管理员执行 `CREATE SCHEMA jhaven AUTHORIZATION jhaven_owner;`，把对象所有权留给迁移角色。
3. 在维护环境设 `MIGRATION_DATABASE_URL`，使用 Connect 页的 Direct `5432`，或在只有 IPv4 时用 Session pooler `5432`，以 `jhaven_owner` 连接。共享 pooler 的用户名为 `角色名.项目引用`。同时设置 `DATABASE_CA_PEM`，在仓库根目录运行 `npm run db:migrate`，然后由对象所有者在同一目标库执行 [运行权限 SQL](../apps/server/migrations-postgres/runtime-grants.sql)。通过 `psql` 运行授权时用 `sslmode=verify-full` 及对应 CA 文件。 [连接方式](https://supabase.com/docs/guides/database/connecting-to-postgres)
4. 在 Vercel → JHaven → Settings → Environment Variables 为目标环境设置 `DATABASE_URL` 和 `DATABASE_CA_PEM`。运行 URL 使用 Connect 页的 Transaction pooler `6543`，账号为 `jhaven_app.项目引用`，密码中的特殊字符需 URL 编码。应用 URL 不附加 `sslmode` 或其他查询参数，CA 和 TLS 由连接池控制，避免 URL 参数覆盖证书选项。应用每热实例复用一个连接，不使用命名预编译语句。保留现有 `APP_ORIGIN` 规则。 [pg TLS 参数](https://node-postgres.com/features/ssl)
5. 删除 Vercel 的旧变量 `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD`、`DB_TLS`。`MIGRATION_DATABASE_URL` 仅留在维护环境。此流程创建新 PostgreSQL 结构，后续需要迁移旧业务数据时须单独处理。

首次部署后核对 `/`、刷新 `/assistant`、`/audio/manifest.json`、`/api/health`、`/api/auth/status` 及 `/api/assistant/status`。再在 Preview 独立库验证登录 Cookie、同源写请求、代理传输和助手 NDJSON。 [Vercel 系统变量](https://vercel.com/docs/environment-variables/system-environment-variables)

## 自托管发布路径（手动执行，尚未执行）

1. 在目标环境使用 Node 24.12+ 的 24.x 与 npm 11，获取经过检查的源码和锁文件。
2. 根目录执行 `npm ci`、`npm run check`，需要时执行 E2E；保留发布版本与输出，禁止在正在服务的目录直接覆盖构建。
3. 将 `apps/web/dist` 的内容放到静态根目录，例如 `/srv/jhaven/web`。该目录中应有 `index.html`、`assets`、favicon 和第三方许可声明。
4. API 保留根 `package.json`、根 `node_modules`、`apps/server` 和 `packages/shared` 的清单及各自 `dist`，保证 workspace 符号链接有效。不能仅复制 `apps/server/dist` 后期待共享包自动存在。
5. 在独立 PostgreSQL 目标库使用 `MIGRATION_DATABASE_URL` 和 `DATABASE_CA_PEM` 执行迁移与授权，运行时切换到受限 `DATABASE_URL`。设置 `NODE_ENV=production`、`HOST=127.0.0.1`、`PORT=3001` 和实际 HTTPS `APP_ORIGIN`，以无特权用户运行 `npm start`。探测 `/api/auth/status` 和 `/api/health`。 [数据库](DATABASE.md) [账户](AUTH.md)
6. Nginx 同域提供静态内容并代理 `/api/`。可在现有 Nginx 的 `http` 上下文包含 `deploy/nginx.conf`，按实际路径与域名替换。外部 HTTPS 入口的证书/终止层由宿主负责配置，示例只监听本地 8080，不直接开放到公网。
7. 经 HTTPS 入口验证 `/`、刷新 `/about`、404 路由和 `/api/health`。API 不应被 SPA fallback 吞掉；`/assets/` 不存在的文件必须返回 404。

开放私人日记前需验证用户数据隔离、删除与备份恢复。生产使用实际 HTTPS 和数据库服务，并按 `AUTH.md` 配置反代和限流。部署示例要求同源 Cookie，生产环境不得使用 Vite 代理或 HTTP 开发例外。

### 睡前助手

部署后验证 `/assistant` 及 `/api/assistant/status`。网关须逐段转发助手的 NDJSON 响应，保留服务端的 `X-Accel-Buffering: no` 行为，并在客户端断开时中断上游。启用模型前配置并核对供应商额度，确认公网代理的可信 IP 设置。生产代理流式验证仍待执行。 [服务端环境变量](ASSISTANT.md)

## 回滚与停机

保留上一个可启动版本的静态与 API 产物，一起切回，避免共享契约不同步。数据库迁移需额外审查向后兼容，回滚二进制不会自动回滚表结构。API 收到 SIGTERM/SIGINT 时停止接收新连接并关闭连接池，目标宿主仍需验证信号转发与优雅重启。

## 已知环境限制

- 当前工作区 Git 所有者与执行用户不同，安全检查需临时使用 `git -c safe.directory=D:/Projects/JHaven ...`；本次未修改全局 safe.directory。
- 当前沙箱对 npm 与浏览器下载的 DNS 受限，已通过显式网络权限执行下载。其他环境如遇 ENOTFOUND，应检查网络/代理，不绕过 TLS 校验。
- 本次只在 Windows 环境执行；跨平台目标与实际部署宿主需按同一检查命令重新验证。
