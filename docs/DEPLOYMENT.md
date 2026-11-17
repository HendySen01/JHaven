# 本地运行与部署准备

## 当前状态

当前骨架可构建为 Vue 静态资源与 Node ESM API；尚未部署，也未绑定域名、创建云资源或连接 MySQL。本说明为可操作的自托管路径，不表示已完成生产验收。当前没有私人业务可对外提供。

静态部署保留 apps/web/dist/audio 内 10 条 WAV、manifest 与署名，缺失音频应返回 404。根构建校验哈希和数字质量。生产 Nginx 与 HTTPS 尚未实测。

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

## 自托管发布路径（手动执行，尚未执行）

1. 在目标环境使用 Node 24.12+ 的 24.x 与 npm 11，获取经过检查的源码和锁文件。
2. 根目录执行 `npm ci`、`npm run check`，需要时执行 E2E；保留发布版本与输出，禁止在正在服务的目录直接覆盖构建。
3. 将 `apps/web/dist` 的内容放到静态根目录，例如 `/srv/jhaven/web`。该目录中应有 `index.html`、`assets`、favicon 和第三方许可声明。
4. API 保留根 `package.json`、根 `node_modules`、`apps/server` 和 `packages/shared` 的清单及各自 `dist`，保证 workspace 符号链接有效。不能仅复制 `apps/server/dist` 后期待共享包自动存在。
5. 为已创建的独立数据库设置 `DB_*`，用迁移账号显式执行数据库迁移，再切换为运行时账号。运行构建后迁移可从 `apps/server` 执行 `node --env-file-if-exists=.env dist/db/migrate.js`。设置 `NODE_ENV=production`、`HOST=127.0.0.1`、`PORT=3001`、`APP_ORIGIN` 为对外 HTTPS 来源，以无特权用户运行 `npm start`。账户部署应探测 `/api/auth/status`，保留进程健康接口 `/api/health`。 [数据库](DATABASE.md) [账户](AUTH.md)
6. Nginx 同域提供静态内容并代理 `/api/`。可在现有 Nginx 的 `http` 上下文包含 `deploy/nginx.conf`，按实际路径与域名替换。外部 HTTPS 入口的证书/终止层由宿主负责配置，示例只监听本地 8080，不直接开放到公网。
7. 经 HTTPS 入口验证 `/`、刷新 `/about`、404 路由和 `/api/health`。API 不应被 SPA fallback 吞掉；`/assets/` 不存在的文件必须返回 404。

开放私人日记前需验证用户数据隔离、删除与备份恢复。生产使用实际 HTTPS 和数据库服务，并按 `AUTH.md` 配置反代和限流。部署示例要求同源 Cookie，生产环境不得使用 Vite 代理或 HTTP 开发例外。

## 回滚与停机

保留上一个可启动版本的静态与 API 产物，一起切回，避免共享契约不同步。数据库迁移需额外审查向后兼容，回滚二进制不会自动回滚表结构。API 收到 SIGTERM/SIGINT 时停止接收新连接并关闭连接池，目标宿主仍需验证信号转发与优雅重启。

## 已知环境限制

- 当前工作区 Git 所有者与执行用户不同，安全检查需临时使用 `git -c safe.directory=D:/Projects/JHaven ...`；本次未修改全局 safe.directory。
- 当前沙箱对 npm 与浏览器下载的 DNS 受限，已通过显式网络权限执行下载。其他环境如遇 ENOTFOUND，应检查网络/代理，不绕过 TLS 校验。
- 本次只在 Windows 环境执行；跨平台目标与实际部署宿主需按同一检查命令重新验证。
