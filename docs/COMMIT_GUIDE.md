# Sprint 1 提交说明

## 当前事实

- 本地分支是 `master`，尚无 Commit，工作区初始化基础与 Sprint 1 文件均未跟踪。
- 本轮开始前 63 个现有文件已保留本地对照快照；没有丢弃已有文件，没有暂存或修改 Git 配置。
- 本地没有 remote。2026-11-18 已用只读 `git ls-remote` 验证用户给出的 `https://github.com/HendySen01/JHaven.git` 可访问且未返回分支或标签。
- 不需要填写尚未生成的提交 Hash。完成提交后用 `git log -1 --oneline` 查看，项目状态文档记录版本与功能即可。

## 建议提交内容

首次提交需包含工程初始化基础，否则新增组件引用的依赖与工具无法复现。本轮提交候选为：

- 根工程约定、清单、锁文件和工具配置。
- `apps/web` 的源码、静态许可声明和构建配置；`apps/server` 的基础 API/测试/配置；`packages/shared` 的契约与清单。
- `tests/e2e`、`scripts/report-licenses.mjs`、`deploy/nginx.conf`。
- 项目文档、PROJECT_STATUS、许可证补充原文和开发路线。

不包含 node_modules、dist、artifacts 快照/截图、浏览器报告、测试输出、真实 `.env`、日志或私人资料。允许提交的 `apps/server/.env.example` 只有非敏感的本机监听示例。

本轮与初始化基线的文件级差异汇总位于忽略提交的 `artifacts/sprint1-review.json`，完整补丁位于 `artifacts/sprint1-review.patch`。由于所有文件未跟踪，单独 `git diff` 为空不能视为没有变更。

## 用户手动执行的提交命令

以下命令仅供复制使用，本轮不会自动执行。当前 Git 所有者安全检查需要单次 `-c`；这不会改全局配置。先确认 `PROJECT_STATUS.md` 的最终测试已通过且没有阻断问题。

```powershell
Set-Location D:\Projects\JHaven
git -c safe.directory=D:/Projects/JHaven status --short
git -c safe.directory=D:/Projects/JHaven add -- .editorconfig .gitattributes .gitignore .node-version .npmrc .nvmrc .prettierignore .prettierrc.json .vscode/extensions.json .vscode/settings.json AGENTS.md README.md package.json package-lock.json eslint.config.js tsconfig.base.json tsconfig.tools.json vitest.config.ts playwright.config.ts
git -c safe.directory=D:/Projects/JHaven add -- apps/web/src apps/web/public apps/web/index.html apps/web/package.json apps/web/tsconfig.json apps/web/vite.config.ts apps/server/src apps/server/package.json apps/server/tsconfig.json apps/server/tsconfig.test.json apps/server/.env.example packages/shared/src packages/shared/package.json packages/shared/tsconfig.json
git -c safe.directory=D:/Projects/JHaven add -- tests/e2e scripts/report-licenses.mjs deploy/nginx.conf docs
git -c safe.directory=D:/Projects/JHaven diff --cached --check
git -c safe.directory=D:/Projects/JHaven diff --cached --stat
git -c safe.directory=D:/Projects/JHaven diff --cached
git -c safe.directory=D:/Projects/JHaven commit -m "feat: build JHaven sleep home experience"
```

本次文档目录已审查，后续有新增文件时仍要先看状态和暂存差异，不能直接复用目录级暂存而跳过检查。

## 用户明确需要发布到 GitHub 时

下面推送本地实际的 `master`，不自动改名为 main。远端目前为空；若执行时远端已变化，应先核对，不使用 force 覆盖。

```powershell
git -c safe.directory=D:/Projects/JHaven remote -v
# 仅在仍没有 origin 时执行下一行。
git -c safe.directory=D:/Projects/JHaven remote add origin https://github.com/HendySen01/JHaven.git
git -c safe.directory=D:/Projects/JHaven push -u origin master
```

如果用户选择其他分支名称，应以实际 `git branch --show-current` 为准更新推送命令，禁止猜测远端状态。
