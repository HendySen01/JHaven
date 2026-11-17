# 测试与验证

## 执行命令

`npm run check` 顺序检查格式、ESLint、类型、Vitest/API 和生产构建。`npm run test:e2e` 会重建项目，自动启动构建后的 API 和 Vite 静态预览，结束时关闭自身启动的服务。

E2E 首次需要 `npx playwright install chromium`，Linux CI 可加 `--with-deps`。3001、4173 必须空闲，避免将其他实例误认为待测服务。桌面与移动项目均基于 Chromium；移动仿真不等于真机验证。

若官方浏览器下载不可达，但已有系统 Chrome/Edge，可显式设置 `PLAYWRIGHT_CHANNEL=chrome` 或 `msedge` 后运行同一测试。默认仍使用 Playwright 自带 Chromium，不静默切换。PowerShell 示例：`$env:PLAYWRIGHT_CHANNEL='chrome'`，执行后用 `Remove-Item Env:PLAYWRIGHT_CHANNEL` 恢复。报告必须注明实际浏览器来源。

## 当前测试覆盖

- API 成功契约、安全头、未声明参数、未知接口、非法 JSON 和正文限制。
- 启动配置默认值与无效端口。
- 前端健康响应校验、HTTP 错误、响应结构异常与网络异常。
- 桌面/移动浏览器：首页 → 关于页 → 真实 API → 手动重查 → 刷新深链接。
- 服务失败提示及重试恢复、键盘跳过导航、减少动态效果、横向溢出、未知路由返回首页。

- 四种今晚状态解释、合法/非法场景、偏好字段白名单、损坏/版本不兼容/存储受限的回退。
- 375/768/1440px：首页到场景/详情/日记；选择标记、导航高亮与刷新清空内存状态。
- 原生 radio 方向键、设置开闭、Escape/外侧点击、首尾 Tab 循环和焦点返回。
- 配色/夜景/减少动画的持久化、恢复默认、禁止 localStorage 时只在当前生效、系统减少动态效果优先。

## Sprint 1 执行记录（2026-11-18，Asia/Macau）

Windows / Node 24.21.0 / npm 11.19.0，未新增依赖。

| 检查                                              | 实际结果                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `npm run check`                                   | 格式、Lint、三包与工具类型检查、35/35 Vitest/API、生产构建通过                               |
| `PLAYWRIGHT_CHANNEL=chrome` 下 `npm run test:e2e` | 最终 30/30，系统 Chrome；375px 手机触屏仿真、768px 平板视口与 1440px 桌面                    |
| 开发启动                                          | `npm run dev` 成功，shared 监听 0 错误，前端首页 HTTP 200，API 已启动                        |
| 视觉检查                                          | 三档首页、移动/桌面设置与场景详情截图已查看；修正手机月亮接近操作区与详情导航高亮            |
| 文件与敏感内容                                    | 对比初始化快照审查，未删除文件；常见凭据模式与敏感文件名扫描无匹配；未提交环境文件或生成产物 |

首轮 E2E 为 27/30，三档均在设置首尾 Tab 循环断言失败；修复组件焦点循环后重跑通过。格式检查发现一处 Vue 排版问题，已修正。没有把失败或未执行的检查算作通过。

截图位于忽略提交的 `artifacts/sprint1-home-375.png`、`sprint1-home-768.png`、`sprint1-home-1440.png`、`sprint1-settings-375.png`、`sprint1-settings-1440.png`、`sprint1-scene-detail.png`，E2E 的首页截图也保留在 `test-results`。浏览器采用显式系统 Chrome 选项，未重试上轮停滞的 Chromium 下载。仿真不代表真机验证，不代表医疗或性能结论。

## 初始化历史记录（2026-11-18，Asia/Macau）

环境：Windows / Node 24.21.0 / npm 11.19.0。

| 检查           | 实际结果                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| 依赖安装       | 成功；最终安装报告 0 个已知漏洞；已替换弃用的 Lucide 旧包                                                            |
| 完整检查       | `npm run check` 通过：格式、ESLint、三包及工具类型检查、15 项单元/API 测试、共享包/服务/前端生产构建                 |
| 浏览器端到端   | `PLAYWRIGHT_CHANNEL=chrome` 下 `npm run test:e2e` 通过：8/8，系统 Chrome，桌面和 Pixel 7 视口仿真                    |
| 启动与视觉检查 | `npm run dev` 成功启动 shared/API/web，监听 0 类型错误；桌面首页、390px 首页、关于页截图已逐张检查，无可见裁切或遮挡 |
| 许可清单       | 396 个锁文件依赖项已登记，汇总 106 个生产依赖原始许可，补齐 Vue Devtools 的上游许可                                  |

沙箱内初次 registry 与 Playwright 下载因 DNS 失败；npm 安装已通过网络权限成功重试。首次 API 测试因回环连接被沙箱以 EACCES 阻止，权限重跑后 15/15 通过。Playwright 官方 Chromium 在权限重试后仍持续停留 0 字节，已停止该下载，显式改用预装 Chrome 完成全部浏览器测试；**未验证 Playwright 自带 Chromium 的下载路径**。npm audit 的零公告结果不代表安全审计完成。

视觉截图位于忽略提交的 `artifacts/home-desktop.png`、`artifacts/home-mobile.png`、`artifacts/about-desktop.png`；Playwright 报告位于 `playwright-report/index.html`。这些是本地验证产物，不是用户反馈或性能基准。

## 未覆盖范围

未实现的音频、后台/锁屏、权限、MySQL、认证、日记与 AI 不存在功能测试。Safari、Firefox、真实 iOS/Android、Nginx 配置实际加载与生产宿主尚未验证。未来对外内测前必须补齐相应业务和设备测试，不据此声称临床效果或性能指标。
