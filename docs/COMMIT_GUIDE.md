# Sprint 2 提交说明

## 当前事实

- 本轮开始时 main 跟踪 origin/main，工作区干净，已确认最近 Commit 为 beab93b5a14c3b89a64573705782373d242a8fb3（Sprint 1）。
- origin 已配置为 https://github.com/HendySen01/JHaven.git，不重复 remote add，不猜测远端当前是否又有新提交。
- 本轮没有暂存、commit、push、生产部署、改分支或修改 Git 配置。
- 版本为 0.1.0-alpha.2；不在状态文件填写本次尚未创建的 Commit Hash。历史用 git log 查看。
- 上轮无历史/master 的首次提交说明已失效，不能直接照搬。

## 本次提交范围

- 应用级音频引擎、轨道/计时/包络、类型、store/composable、混音/定时/全局控制 UI。
- 三条逐项核查 CC0 的实录循环 WAV，manifest、署名、显式制作与构建校验工具。
- 现有首页/场景/推荐/关于文案、生命周期、独立音频样式及 Nginx 音频 404 规则。
- 增益/并发/计时/清理/存储的受控测试、真实 Chrome/Edge 音频与 UI 回归。
- 根/工作区版本和锁文件，以及产品、架构、资源、安全、设计、路线、测试和状态文档。

不包含 artifacts 内原始下载/截图、node_modules、dist、测试报告、真实 .env、密钥或用户内容。三条 WAV 是本轮明确授权并需要分发的业务资源，应提交，不能因二进制而遗漏。

## 用户手动提交命令

以下命令由用户执行，本轮只提供，不自动暂存或提交。运行前先检查最终 PROJECT_STATUS/TESTING 是否有阻断问题，再审查所有暂存差异。

    Set-Location D:\Projects\JHaven
    $jhGit = @('-c', 'safe.directory=D:/Projects/JHaven')
    git @jhGit status --short
    git @jhGit diff --check
    git @jhGit add -- .gitattributes AGENTS.md README.md package.json package-lock.json apps/server/package.json apps/web/package.json apps/web/index.html
    git @jhGit add -- apps/web/src apps/web/public/audio packages/shared/package.json packages/shared/src/index.ts tests/e2e
    git @jhGit add -- scripts/prepare-audio.mjs scripts/verify-audio.mjs deploy/nginx.conf docs
    git @jhGit diff --cached --check
    git @jhGit diff --cached --stat
    git @jhGit diff --cached
    git @jhGit commit -m "feat: implement JHaven ambient audio engine"

目录级路径仅因本轮已审查其中全部新增/修改而列出；用户执行前有新改动时应改为逐文件暂存。不得使用 git add . 或提交未确认文件。

## 用户需要推送时

当前实际分支是 main，origin 已存在。只有在用户决定发布本地提交后才执行：

    git -c safe.directory=D:/Projects/JHaven push origin main

若远端已变化，先核对差异并正常整合，不使用 force 覆盖。Git 所有者问题通过单次 safe.directory 处理，本轮不改全局信任列表。
