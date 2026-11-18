# 测试与验证

## Sprint 6C 意图理解与证据回答

新增 DeepSeek Mock 测试，覆盖无关键词的意图识别、短澄清、本次检索的引用限制、原审核摘要插入、无依据问题、虚假来源、越权结构和不安全说明。复用已有 Mock 用例检验注入、供应商错误、超时、取消、调用额度与隐私。新增 Chrome 场景核对证据链接、推荐理由和确认交互。

隔离 MySQL 下 `npm run check` 通过格式、ESLint、TypeScript、113/113 项单元和 API 测试及生产构建。真实模型调用为 0。

系统 Chrome 的 `npm run test:e2e` 在 375、768、1440px 通过 93/93，包含新增 AI 连动用例和既有业务回归。测试关闭外部模型调用，生产网关和实际设备未送测。

## Sprint 6B DeepSeek

新增 Mock HTTP 401、402、429、404、503 分类，DeepSeek SSE 格式、禁用思考、输出 token 限制、旧模型与非官方地址拒绝，以及预算耗尽后本地回退测试。沿用既有取消、超时、断线、注入、隐私和双账户回归。本轮无真实 DeepSeek 调用，无付费测试。Chrome 扩展通信异常不属于本轮排查范围，匿名认证 401 按现有正常行为处理。

隔离 MySQL 下 `npm run check` 通过 106/106、ESLint、类型检查及生产构建。系统 Chrome 的 `npm run test:e2e` 通过 90/90，包含三档视口原有全部回归。首次未注入测试库时有五项数据库用例跳过，随后在隔离库全部通过。Safari、Firefox、移动真机和真实 DeepSeek 服务仍待验证。

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

## Sprint 6 睡前助手验收（2026-11-18，Asia/Macau）

- `npm run check` 在隔离 MySQL 下通过格式、ESLint、TypeScript、99/99 单元及 API 测试、生产构建。新用例覆盖审核来源、未知问题、模型 SSE 分片、提前输出摘要、停止传播、超时、回退、限流、隐私输入和白名单输出。旧用例覆盖认证、声音、收藏、日记与练习。
- 首轮 Chrome 回归中，同一回环 IP 的跨视口请求触发访客限流。通过仅用于测试的可信本地代理和独立文档保留地址隔离测试访客，生产限额保持原值。
- 隔离库下设置 `PLAYWRIGHT_CHANNEL=chrome` 和 `PLAYWRIGHT_API_PORT=43001`，`npm run test:e2e` 通过 90/90，覆盖 375、768、1440px。检查来源、键盘提交、切换前确认、无自动播放、取消、重试、重生成、离开助手路由清空、明确同意与模型限流时的本地回退。
- 正式库仅核对实例标识和 001–006 迁移清单；本轮不涉及新迁移。供应商使用模型替身或模拟 SSE，真实 OpenAI 调用 0 次，无实际 API 调用费用。

## 正式库 003–006 迁移后验收（2026-11-18，Asia/Macau）

- 应用账号在 MySQL 9.6.0 的 `jhaven` 只读确认实例指纹、001–006 的 SHA-256 及应用时间、四张新表和三张基础表的结构。与同版本且迁移哈希一致的隔离库逐张比对 `SHOW CREATE TABLE`，仅忽略数据导致的自增计数差异。结构一致后再开始接口测试。
- 使用 `LIMIT 0` 验证声音预设、偏好、睡眠日记、练习记录四类应用读取语句。正式库连接到本地应用的健康、认证就绪为 200，匿名账户与私人接口为 401。没有正式业务数据读写、迁移重跑或权限变更。
- 端口 43306、`jhaven_test_` 专用库下注入 `JHAVEN_TEST_MYSQL=1`，`npm run check` 通过 91/91 项单元与 API 测试、ESLint、TypeScript 和生产构建。通过注册登录、声音收藏和账户预设、日记、练习记录及双账户访问控制回归。
- 在同一隔离库通过 `PLAYWRIGHT_CHANNEL=chrome`、`PLAYWRIGHT_API_PORT=43001` 执行 `npm run test:e2e`，Chrome 三个视口（375、768、1440px）通过 81/81。检查含注册登录、收藏、日记及练习流程。正式 HTTPS/Nginx、Safari、Firefox、移动真机、锁屏音频及本机语音实际发声本轮未验证。

## Sprint 5 正式环境迁移前验收（2026-11-18，Asia/Macau）

- 正式配置所指的 MySQL 9.6.0 只读核对发现 `jhaven` 只有 001–002，校验和一致。003–006 的迁移记录和表均缺失。以正式库只读连接运行应用，健康和认证就绪为 200，匿名认证、账户及私人数据接口为 401。无真实业务数据读写。
- 标准隔离库通过 001–006 校验和和 006 表结构检查。再次运行 `npm run check` 通过格式、ESLint、类型检查、生产构建、91/91 单元及 API 测试。双账户测试覆盖未登录拒绝、练习创建、重试、跨登录查询、他人无法读取或删除、本人删除，以及原有认证、账户声音场景和日记权限。
- 隔离库下 `PLAYWRIGHT_CHANNEL=chrome` 和 `PLAYWRIGHT_API_PORT=43001` 执行 `npm run test:e2e`，通过 81/81，覆盖 375、768、1440px。Safari、Firefox、实际 iOS/Android、锁屏后音频和本机语音发声本轮未验。正式运行的 HTTPS/Nginx 路径和已登录业务未验。

## Sprint 5 验收（2026-11-18，Asia/Macau）

- 在回环端口 43306 的独立 MySQL 9.6.0 上运行 `npm run db:migrate`，应用 006。正式库未连接，无 DDL、授权或账户数据写入。
- 隔离库配置下注入 `JHAVEN_TEST_MYSQL=1`，`npm run check` 通过格式、ESLint、类型检查、91/91 单元与 API 用例、生产构建。早期检查发现 RouterView 的可选键类型问题，以及旧测试将所有无声景入口当成日记，已修复并全量重跑。
- `PLAYWRIGHT_CHANNEL=chrome` 与 `PLAYWRIGHT_API_PORT=43001` 下 `npm run test:e2e` 通过 81/81，覆盖 375、768、1440px。新增场景覆盖访客、键盘、暂停和跳过、减少动态效果、真实 Web Audio 渐弱及清理、原混音保持、自愿账户记录和声线筛选。声线测试模拟浏览器接口，本机实际发声、Safari、Firefox 与移动真机尚未验证。

## Sprint 4 验收（2026-11-18，Asia/Macau）

- 沿用隔离 MySQL 9.6.0（回环端口 43306，`jhaven_test_` 专用库），用 `npm run db:migrate` 应用 003–005。正式 `jhaven` 只读核对显示 001–002 校验和一致，Sprint 4 三张表尚未创建。
- 注入隔离账号配置并设 `JHAVEN_TEST_MYSQL=1` 后，`npm run check` 通过格式、ESLint、类型、85/85 单元及 API 测试和生产构建。覆盖账户预设、日记和偏好 CRUD、双账户隔离、账户切换时拒绝旧请求、跨午夜、缺失字段与夏令时歧义。
- 保持隔离库并设置 `PLAYWRIGHT_CHANNEL=chrome`、`PLAYWRIGHT_API_PORT=43001`，`npm run test:e2e` 在 375、768、1440px 共通过 66/66。修复首轮回归中的普通定时取消后无法重新应用问题。覆盖现有的访客播放和认证流程，以及个人空间的导入冲突、退出后的本地状态恢复、重新登录、跨午夜日记和 7/30 天趋势。Safari、Firefox、真机和目标 MySQL 8.4 部署仍待验证。

## Sprint 3 验收（2026-11-18，Asia/Macau）

- MySQL Community Server 9.6.0，独立目录、回环端口 43306、随机测试账号和 `jhaven_test_` 库。`npm run db:migrate` 首次应用两条迁移，再次确认无重复。MySQL 8.4 与生产 HTTPS 未实测。
- 将专用测试库 `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` 注入当前进程后，设 `JHAVEN_TEST_MYSQL=1`，`npm run check` 通过 82 项单元/API、格式、Lint、类型和生产构建。真实库测试包括重复用户名、密码错误一致性、密码哈希、跨 App 会话恢复、双用户隔离、Cookie 轮换/撤销/过期及生产 Cookie 属性。测试只对 `jhaven_test_` 前缀隔离库开放。
- 保持同一测试库，设置 `PLAYWRIGHT_CHANNEL=chrome`、`PLAYWRIGHT_API_PORT=43001`，执行 `npx playwright test`，63/63 通过 375、768、1440px。覆盖注册和登录校验、错误、受保护路由、刷新、退出及全部声音回归。Playwright 为 API 配置预览站点 Origin。未提供独立测试库时，真实数据库用例明确跳过。
- `npm run dev` 在 Vite 默认 5173 与 API 专用 43002 同时启动。HTTP 页面及 `/api/auth/status` 经 Vite 代理验证为 200。停止本轮独立 MySQL 后，通过同一代理验证账户就绪为 503 `DATABASE_UNAVAILABLE`，雨声 WAV 仍返回 200。测试使用临时账户，连接配置与截图报告在忽略目录中。

## Sprint 2.5 验收（2026-11-18，Asia/Macau）

`npm run check`：74/74 单元/API 测试、类型、Lint、生产构建通过。校验 10 条 WAV 的许可、哈希、PCM 峰值、静音、动态和接缝。`npx playwright test`（`PLAYWRIGHT_CHANNEL=chrome`、`PLAYWRIGHT_API_PORT=43001`）：57/57，通过 375、768、1440px。音频图采样实际解码的 PCM，测试输出走静音支路；专业听审、硬件声压、真机锁屏和整夜未验证。3001 被占用时使用专用回环端口，其值由 Playwright 传给 Vite 代理。

追加使用 Playwright 原生音频探针，从本地开发页连续观测全音量十轨 65.04 秒。采样峰值 0.1746，实际样本率 48 kHz，解码缓冲共 8,784,000 单声道 Float32 帧，约 35.14 MB 的样本数据。原有 10 个节点未重建，无重复解码，停止后活跃节点为 0。观测范围是抽样数字信号及节点，总进程内存和硬件听感仍待验证。

## Sprint 2 执行记录（2026-11-18，Asia/Macau）

Windows / Node 24.21.0 / npm 11.19.0，未新增 npm 依赖。

| 检查                                                                                                   | 实际结果                                                                                     |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `npm run check`                                                                                        | 格式、ESLint、三包及工具类型检查、73/73 Vitest/API、生产构建通过                             |
| `npm run audio:verify`（构建前自动执行）                                                               | 三条 CC0 清单字段、SHA-256、字节长度、32kHz 单声道 WAV 与 21 秒时长通过                      |
| `PLAYWRIGHT_CHANNEL=chrome` 下 `npm run test:e2e`，布局修复后用 `npx playwright test` 复测同一最终构建 | 51/51，通过 375px 触屏仿真、768px 平板和 1440px 桌面矩阵                                     |
| `PLAYWRIGHT_CHANNEL=msedge` 下 `npx playwright test tests/e2e/audio.spec.ts --project=desktop-1440`    | 最终 7/7 核心音频用例通过，系统 Edge、桌面 1440px                                            |
| 本地开发与截图                                                                                         | `npm run dev` 可启动；三档播放器与控制条截图已逐张检查；无横向溢出，移动端隐私入口遮挡已修复 |

新增 38 项受控单元测试覆盖音量边界、预设/存储校验、重复播放、并发切换、迟到解码、停止重启、暂停/取消/重设计时、包络恢复、权限拒绝、下载/解码失败与超时、节点/监听/Context 释放。加上原有 35 项 API/UI 逻辑测试，共 73 项。Mock 只验证控制流，不代表真实声音播放。

新增 7 项浏览器用例在三个视口运行：真实三轨非零 PCM 混合、原生音量键盘操作、暂停/继续/跨页停止、预设/自定义保存恢复删除、损坏/受限存储、刷新不自动播放、6 秒实际定时渐弱、解码错误重试、拒绝 resume、慢加载中停止、Context 挂起/恢复与 pagehide 关闭。加上原有 30 项 UI/API 场景，总计 51 项。全局播放条可见时也验证隐私入口可点击。

浏览器探针仅放在 tests 中，使用原生 AudioContext、解码器、BufferSource 和 GainNode，以 Analyser 采样实际非零 PCM，再经静音支路连接 destination，避免打扰设备使用者。成功路径未放宽自动播放策略；拒绝权限/坏音频等通过故障注入。没有进行扬声器或耳机听感评估，不能把采样结果当成真机或整夜稳定性结论。

首轮 Chrome 为 30 通过/18 失败，发现原生 fetch 以类属性接收者调用导致 Illegal invocation，包装调用修复后 48/48 通过。扩展后的首轮 51 项中 3 项在异步 SPA 导航完成前触发返回，增加目标页面就绪等待后全矩阵通过。早期 Mock 复用已消费 Response 也已修正。视觉检查发现 375px 全局控制条覆盖页脚隐私链接，补底部空间并回归。一次测试启动因开发服务占用 3001 被明确拒绝，停止本轮服务后重跑，未通过复用其他实例绕过检查。

截图和检查脚本位于忽略提交的 artifacts：`sprint2-player-375.png`、`sprint2-player-768.png`、`sprint2-player-1440.png`、对应 `sprint2-relax-*.png` 与 `sprint2-dock-*.png`、`sprint2-visual.json`。Chrome 报告归档在 `artifacts/sprint2-chrome-report`；最终 Edge 报告在 playwright-report。本地截图/报告、原始下载和 dist 不提交。

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

Safari、Firefox、真实 iOS/Android、手机锁屏/整夜和音轨硬件听感未验证。生产 HTTPS/Nginx、助手流式代理及生产模型配置尚未验证。正式库完成 001–006 迁移与只读验收，登录后的业务写入及账户隔离在隔离库验证。
