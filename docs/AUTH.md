# 账户与会话

用户注册时输入用户名、密码及确认密码。用户名由服务端规范化为小写，允许 3–32 个 ASCII 字母、数字或下划线。新密码 12–128 个字符，支持密码短语。仅保存带独立随机盐的版本化 scrypt 哈希，参数 N=32768、r=8、p=3。认证使用恒时摘要比较。不存在的用户名也走相同 KDF，返回与错误密码相同的错误。注册遇到数据库唯一约束时提示尝试其他用户名。

| 方法与路径                | 用途                                         |
| ------------------------- | -------------------------------------------- |
| `POST /api/auth/register` | 201 创建账户，提示用户登录，重复名称 409     |
| `POST /api/auth/login`    | 使用凭据创建并轮换会话，返回公开账户字段     |
| `GET /api/auth/me`        | 浏览器刷新时凭 Cookie 恢复会话               |
| `GET /api/account`        | 受保护账户资源，服务端仅根据有效会话选择用户 |
| `POST /api/auth/logout`   | 撤销数据库中的会话并清除 Cookie              |
| `GET /api/auth/status`    | 数据库或迁移未就绪时 503                     |

会话 Cookie 保存随机 256 位令牌，数据库只保存 SHA-256 摘要。会话固定 7 天过期，登录轮换、退出立即撤销此浏览器会话。生产启用 `__Host-jhaven_session` 和 `Secure`，所有环境启用 `HttpOnly`、`SameSite=Lax`、`Path=/` 并省略 Domain。账户 API 无凭据存储在前端 localStorage，响应沿用错误信封和 `Cache-Control: no-store`。

所有认证写请求要求 JSON 和与 `APP_ORIGIN` 完全匹配的 Origin，缺失 Origin、跨站标记或其他来源均拒绝。浏览器从同一来源访问 API，Vite 和部署代理转发 `/api`。注册每 IP 每 15 分钟 12 次，登录 15 次，超限返回 429 和 Retry-After。KDF 进程内并发最多 4 个。多实例需在网关配置统一限流。反代部署只在服务监听回环、代理覆盖客户端地址头时开启 `TRUST_LOOPBACK_PROXY=1`；默认不信任转发头。

`GET /api/health` 是基础进程存活探测，账户部署的就绪探测应使用 `/api/auth/status`。数据库关闭、迁移缺失或配置缺失时，账户错误有明确提示，访客可以继续使用声音库。运行账户前显式迁移。生产使用独立迁移账号与最小权限运行账号，生产 Origin 必须是实际 HTTPS 来源。MySQL 跨主机连接启用 `DB_TLS=1` 并配置信任链。

访客可播放、收藏、保存自定义场景与定时。声音收藏、设备音量、配比、场景及界面设置均为浏览器设备偏好，登录不会上传、覆盖或合并它们。登录身份只存在 Cookie、服务端会话与前端内存中。当前账户页只显示自己的用户名。日记、跨设备同步、账户删除及密码找回待开发。

参考 [OWASP 密码存储](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)、[会话管理](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)、[CSRF 防护](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)。
