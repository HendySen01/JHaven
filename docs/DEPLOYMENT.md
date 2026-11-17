# 本地运行与部署准备

## 当前状态

当前骨架可构建为 Vue 静态资源与 Node ESM API；尚未部署，也未绑定域名、创建云资源或连接 MySQL。本说明为可操作的自托管路径，不表示已完成生产验收。当前没有私人业务可对外提供。

Sprint 2 已有实际可播放的自托管环境音，仍无账户/日记业务。部署必须保留 apps/web/dist/audio 内三条 WAV、manifest 与署名；缺失音频必须返回 404，不能返回 index.html。根构建自动校验哈希与格式，不需要联网下载音频。Nginx 示例已增加 /audio/ 规则；本机尚未实际安装/验证该 Nginx 配置。

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
5. 在 API 根工作目录设置 `NODE_ENV=production`、`HOST=127.0.0.1`、`PORT=3001`，以无特权用户运行 `npm start`，使用宿主的进程管理器重启和收集最小日志。敏感环境配置留在版本库外。
6. Nginx 同域提供静态内容并代理 `/api/`。可在现有 Nginx 的 `http` 上下文包含 `deploy/nginx.conf`，按实际路径与域名替换。外部 HTTPS 入口的证书/终止层由宿主负责配置，示例只监听本地 8080，不直接开放到公网。
7. 经 HTTPS 入口验证 `/`、刷新 `/about`、404 路由和 `/api/health`。API 不应被 SPA fallback 吞掉；`/assets/` 不存在的文件必须返回 404。

后续若开放登录与日记，必须先完成 `SAFETY.md` 的认证、CSRF、权限、数据库迁移、备份和删除条件。不要将 Vite 的开发代理、`Secure` Cookie 的本地例外或通配 CORS 带到生产。

## 回滚与停机

保留上一个可启动版本的静态与 API 产物，一起切回，避免共享契约不同步；当前没有数据库迁移。API 收到 SIGTERM/SIGINT 时停止接收新连接，最多等待约 10 秒后关闭已有连接。目标宿主仍需验证信号转发与优雅重启行为。

## 已知环境限制

- 当前工作区 Git 所有者与执行用户不同，安全检查需临时使用 `git -c safe.directory=D:/Projects/JHaven ...`；本次未修改全局 safe.directory。
- 当前沙箱对 npm 与浏览器下载的 DNS 受限，已通过显式网络权限执行下载。其他环境如遇 ENOTFOUND，应检查网络/代理，不绕过 TLS 校验。
- 本次只在 Windows 环境执行；跨平台目标与实际部署宿主需按同一检查命令重新验证。
