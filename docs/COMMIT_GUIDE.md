# Sprint 2.5 与 Sprint 3 提交说明

当前 main 跟踪 origin/main，起点为 Sprint 2 的已确认提交。当前没有暂存。本轮已审查的源文件与素材可分两次提交。测试数据库、临时凭据、原始下载、构建、测试报告及补丁均在忽略目录。

A 阶段的独立补丁位于 `artifacts/sprint25-sound-library.patch`。它来自 B 开始前的验收快照，包含音轨二进制、播放器、证据和 A 阶段状态。使用 `--cached` 将这个快照单独暂存，即可保留工作区里的 B 阶段修改。A 验收为 74 项单元/API 和 57 项 Chrome，通过类型、Lint、生产构建及 PCM 校验。

```powershell
Set-Location D:\Projects\JHaven
$jhGit = @('-c', 'safe.directory=D:/Projects/JHaven')
git @jhGit status --short --branch
git @jhGit diff --cached --name-only
git @jhGit apply --cached --check artifacts/sprint25-sound-library.patch
git @jhGit apply --cached artifacts/sprint25-sound-library.patch
git @jhGit diff --cached --check
git @jhGit diff --cached --stat
git @jhGit diff --cached
git @jhGit commit -m "feat: expand and validate JHaven sound library"
```

执行 A 提交后，核对剩余差异。B 阶段包含账户 UI、公共契约、MySQL 数据与会话实现、依赖和许可、真实 API/浏览器测试及配套文档，82 项单元/API 和 63 项 Chrome 通过。以下路径仅适用于本次已审查的工作区。期间有新的本地修改时，按具体文件暂存。

```powershell
git @jhGit status --short
git @jhGit add -- AGENTS.md README.md apps/server apps/web/package.json apps/web/public/THIRD_PARTY_NOTICES.txt
git @jhGit add -- apps/web/src/App.vue apps/web/src/components/NightNavigation.vue apps/web/src/main.ts apps/web/src/router/index.ts apps/web/src/stores/auth.ts apps/web/src/styles/auth.css apps/web/src/views/AboutView.vue apps/web/src/views/AccountView.vue apps/web/src/views/AuthView.vue
git @jhGit add -- docs package.json package-lock.json packages/shared/package.json packages/shared/src/auth.ts packages/shared/src/index.ts playwright.config.ts tests/e2e/auth.spec.ts
git @jhGit diff --cached --check
git @jhGit diff --cached --stat
git @jhGit diff --cached
git @jhGit commit -m "feat: implement JHaven user authentication"
```

确认需要推送时，当前分支命令为：

```powershell
git @jhGit push origin main
```
