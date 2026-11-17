# 架构与技术决策

## 当前结构

```text
浏览器 Vue SPA
  ├── Vue Router：/、/relax、/relax/:sceneId、/journal、/about、404
  ├── Pinia：service（内存）、evening（内存）、preferences（浏览器本地）
  └── GET /api/health
         ↓ 同源代理
     Express API → 统一错误响应

packages/shared：应用元信息、Zod 健康检查契约、公共错误类型
```

开发时 Vite 代理 `/api` 到本地 Express；生产时静态托管与 API 反向代理保持同源。未开启通配 CORS，没有 Cookie、鉴权接口或数据写入接口。健康检查仅证明 API 进程可响应，不证明数据库或未来业务就绪。

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

唯一已实现接口为 `GET /api/health`，不接受查询参数。成功：

```json
{ "status": "ok", "service": "jhaven-api", "stage": "ui-preview" }
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

## 后续模块边界

Sprint 1 组件：`NightNavigation`/`JHavenLogo` 负责导航品牌，`MoodSelector` 负责原生单选与建议，`AmbientSceneCard`/`SceneArtwork` 负责元数据与静态插画，`PrimaryButton` 为带真实路由的主操作，`SettingsPanel`/`ModalPanel` 负责偏好与原生对话框。App 只编排全局导航、偏好、设置开闭与页面。

界面偏好键为 `jhaven.ui-preferences.v1`：仅版本、配色、减少动画、显示夜景。读取进行类型与枚举校验并过滤额外字段；损坏或访问受限回退默认值，写失败不阻断当前调整并明确未持久化。系统减少动态效果始终优先；不跨标签页实时同步，也不发送到服务端。今晚状态和所选场景不进 localStorage。

- 后端业务按 auth、diaries、presets、sessions、preferences 组织；路由负责解析和权限入口，服务负责业务，repository 负责参数化 SQL。
- Web Audio 放在独立可释放的音频模块，Vue 组件通过明确 API 操作，不把 AudioContext 深度代理为响应式对象。
- 推荐逻辑为可单测的纯规则函数，知识内容审核与交互独立于音频引擎。
- MySQL 只在数据功能开始时引入，迁移、外键、时区与删除规则见 `DATABASE.md`。
- AI 当前没有依赖、密钥、服务和假接口。后续独立增加授权流程与服务端适配层。

不引入微服务、消息队列、Redis、Kubernetes 或复杂云基础设施。最终宿主与域名尚未选择，不自动发布。
