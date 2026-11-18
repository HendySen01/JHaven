# 架构与技术决策

## 当前结构

```text
浏览器 Vue SPA
  ├── Vue Router：/、/relax、/relax/:sceneId、/journal、/about、404
  ├── Pinia：service/evening（内存）、preferences/audio（本地配置，运行态仅内存）
  ├── AudioEngine → AudioTrack → Gain → Fade → Master → AudioContext.destination
  ├── AudioTimer：单调时钟 + 音频线程增益计划
  └── GET /api/health
         ↓ 同源代理
     Express API → 统一错误响应

packages/shared：应用元信息、Zod 健康检查契约、公共错误类型
```

开发时 Vite 将 `/api` 代理至本地 Express，生产静态站点与 API 保持同一来源。账户使用 HttpOnly Cookie 和固定 Origin。进程存活和账户数据库就绪分别由 `/api/health` 与 `/api/auth/status` 提供。

## 已采用的技术

- **npm workspaces**：三个包共享锁文件，不引入额外 Monorepo 编排框架。包间以本地 workspace 链接和显式版本连接。
- **Node 24 / npm 11**：固定受支持环境；使用 Node 原生环境文件加载与监听能力。
- **Vue 3、Vite、TypeScript 5.9**：SFC、按页懒加载、严格类型。TypeScript 5.9 与当前 ESLint 类型工具兼容，暂不追新到 TypeScript 7。
- **Vue Router 4 / Pinia 3**：服务、今晚状态和界面偏好分开管理。状态建议使用纯函数；不把视觉场景选择解释为播放状态。
- **Tailwind CSS 4 + Vite 插件**：布局工具与 CSS token 配合；夜景为独立编写的静态 CSS，采用系统字体，不加载远程素材。
- **Lucide `@lucide/vue`**：旧 `lucide-vue-next` 安装时报告弃用，已改用维护者指定的新包，仍是 Lucide 图标体系。
- **Express 5 / Zod / Helmet**：最小服务骨架、环境和输入校验、安全头、统一错误。SQL 驱动、密码库、Cookie 库在相关业务开始时再引入。
- **Vitest / Supertest / Playwright**：分别用于独立逻辑、API 与真实浏览器流程。
- **ESLint / Prettier / EditorConfig**：静态规范和跨平台格式。

版本写入清单并通过 `package-lock.json` 固定传递依赖。新增依赖必须在 `THIRD_PARTY.md` 写清用途和许可证。

## 构建与启动

共享包输出 ESM 与类型声明，后端使用 NodeNext 解析和 `.js` 导入；前端用 Bundler 解析。构建顺序为 shared → server → web，避免直接运行 TS 源码作为生产服务。

根目录 `dev` 先构建共享包，然后同时监听 shared、API 和 Vite。共享包变动会更新 `dist`，两端可接收到变更；不要在其他命令运行时删除产物。

## API 契约

基础服务存活检查为 `GET /api/health`，不接受查询参数。成功：

```json
{ "status": "ok", "service": "jhaven-api", "stage": "personal-space" }
```

错误统一为：

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "未找到请求的接口。",
    "requestId": "服务端生成的 UUID"
  }
}
```

已处理未知路由、查询参数、JSON 解析、16 KiB 正文限制、编码异常及未知服务异常；响应不含堆栈，带请求编号与 no-store。前端校验健康响应，5 秒超时后给出可重试提示，不向用户显示原始网络异常。

## 账户链路

Vue 表单和 Express 共用 Zod 账户契约。Pinia 通过同源 `/api/auth/me` 恢复身份，路由守卫负责导航。受保护 `/api/account` 每次从有效 Cookie 会话查询自身资料。Express 将写请求限制为指定 Origin 的 JSON，使用有界限流和异步 scrypt，参数化查询走 mysql2 连接池。MySQL 保存用户与会话摘要。显式 SQL 迁移由命名锁保护；`/api/auth/status` 独立表示数据库和结构就绪。 [账户与会话](AUTH.md) [数据库](DATABASE.md)

## 个人空间链路

`/api/space` 复用会话认证、同源写请求和统一错误处理。客户端携带当前账户 ID 以检测 Cookie 所代表的账户变化，实际数据库归属始终从会话获取。Zod 共享验证账号场景、默认设置和日记，音轨清单由客户端、服务端与构建共同使用。浏览器仅在内存中保存账户偏好和日记，阈值与时序由本地播放器继续执行。趋势图用 Vue 和 SVG 绘制，带等价数值表。

## 后续模块边界

Sprint 2.5 从 `sound-catalog.json` 扩展至 10 条声音，静态文件按需加载。目录、清单与二进制在构建前逐项比对。试听复用单一引擎，暂存原配置和定时，上限 12 秒。分类与收藏在设备端处理，原三轨配比和自定义场景可继续读取。

Sprint 2 音频已经实现：`services/audio` 分离上下文/轨道/单调计时/增益包络，应用级 store 与 composable 供各组件复用。App 负责 pagehide/根卸载清理和跨页面控制条，路由卸载不停止全局声音。原生 fetch 以包装函数调用，避免浏览器接收者错误。

三条短 CC0 自托管 WAV 使用 AudioBufferSource 原生 loop；每轨缓存一个已解码 buffer、至多一个当前 voice。加载任务共享，已经开始的解码可复用，版本号阻止迟到播放。每轨、总音量、渐弱分别管理。暂停保留位置与计时；停止清理 voice；页面卸载关闭 Context。

`jhaven.audio.v1` 仅保存音量/启用配置、自定义场景与已选 ID。严格白名单、枚举与边界校验，不保存或恢复播放/计时，也不上传。来源、状态机、计时/渐弱与浏览器限制详见 `AUDIO_ENGINE.md` 和 `AUDIO_ASSETS.md`。

Sprint 1 组件：`NightNavigation`/`JHavenLogo` 负责导航品牌，`MoodSelector` 负责原生单选与建议，`AmbientSceneCard`/`SceneArtwork` 负责元数据与静态插画，`PrimaryButton` 为带真实路由的主操作，`SettingsPanel`/`ModalPanel` 负责偏好与原生对话框。App 编排全局导航、偏好、设置、页面和应用级音频生命周期。

界面偏好键为 `jhaven.ui-preferences.v1`：仅版本、配色、减少动画、显示夜景。读取进行类型与枚举校验并过滤额外字段；损坏或访问受限回退默认值，写失败不阻断当前调整并明确未持久化。系统减少动态效果始终优先；不跨标签页实时同步，也不发送到服务端。今晚状态与最近浏览的场景只在内存；声音混音及当前预设 ID 由独立音频存储保存。

- 后端业务按 auth、diaries、presets、sessions、preferences 组织；路由负责解析和权限入口，服务负责业务，repository 负责参数化 SQL。
- Web Audio 放在独立可释放的音频模块，Vue 组件通过明确 API 操作，不把 AudioContext 深度代理为响应式对象。
- 推荐逻辑为可单测的纯规则函数，知识内容审核与交互独立于音频引擎。
- MySQL 只在数据功能开始时引入，迁移、外键、时区与删除规则见 `DATABASE.md`。
- AI 当前没有依赖、密钥、服务和假接口。后续独立增加授权流程与服务端适配层。

不引入微服务、消息队列、Redis、Kubernetes 或复杂云基础设施。最终宿主与域名尚未选择，不自动发布。
