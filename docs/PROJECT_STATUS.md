# 项目状态

## 1. 项目基本信息

- 名称：JHaven，Your Quiet Haven, Every Night.
- 当前版本：0.1.0-alpha.2。
- 当前阶段：Sprint 2 — 沉浸式环境音引擎与声音场景。
- 最近更新时间：2026-11-18（Asia/Macau）。
- 整体状态：Sprint 2 核心功能及当前环境可执行的验收已完成，完整检查、Chrome/Edge 回归和三档视觉检查通过；尚无账户、数据库、私人日记或 AI。真机/锁屏/听感限制见第 5、6 节。
- 仓库：https://github.com/HendySen01/JHaven 。本轮开始时工作区干净，已在 main 跟踪 origin/main；旧状态中的 master/无 Commit 信息已按实际 Git 修正。

## 2. 已完成功能

Sprint 1：沉浸式首页、四种今晚状态建议、场景列表/详情、设置、界面偏好、日记未开放说明、About/404、基础 API 与工程检查。

Sprint 2 已实现并有相关验证：

- 三条 CC0 自托管环境实录：雨声、海浪、微风；21 秒循环，合计 4,032,132 字节，许可与哈希清单完整。
- 独立 Web Audio 引擎、单一惰性 AudioContext、每轨开关/0–100 音量/循环/加载错误、总音量。
- 多轨真实混合，播放、短渐弱暂停、继续、主动停止；复用已解码缓冲，至多每轨一个 voice。
- 雨夜、静谧海岸、微风预设；播放时平滑更新配比，浏览详情不重置自定义混音。
- 另存/应用/删除自定义场景，最多 20 个；本地恢复名称和配置，损坏/过期/受限存储回退与明确反馈。
- 不定时、10/20/30 分钟、自定义 0.1–180 分钟；计时独立暂停/继续/重设/取消，与声音暂停联动。
- 音频线程增益自动化渐弱，5/15/30/60 秒可选；取消后恢复正常音量，不修改保存的轨道音量。
- loading/stopping/error 等明确状态、重复命令防重、加载取消、解码失败、权限拒绝和 Context 挂起恢复。
- 跨页面共享播放与控制条，pagehide/根卸载清理；刷新取消计时和播放，仅恢复非敏感配置。

最终测试结果与限制见第 6 节，不将受控 Mock 等同真实浏览器或硬件听感。

## 3. 未完成功能

- 音频后续验证：Safari/Firefox、真实手机、锁屏/整夜和硬件听感；当前没有对应环境或专业听审结果，不标记为已完成。
- Sprint 3：MySQL 迁移、认证、会话 Cookie/CSRF/限流、私人日记 CRUD、删除和隔离；此前日记页继续明确未开放。
- 后续 Alpha：低压力趋势、账户预设同步、审核后的温和引导、必要会话记录、备份恢复与朋友内测。
- 长期：规则 + 审核知识库 + 明确授权的 AI。当前没有 AI 接口或 SDK。

## 4. 重要技术决策

- 沿用 Node 24/npm workspaces、Vue/Pinia/Router/Tailwind/Lucide/Express，不新增第三方 npm 依赖。
- AudioEngine / AudioTrack / AudioTimer / GainEnvelope / audio store 分工；组件不管理原生节点，不按路由重复创建 Context。
- 短音轨 AudioBufferSource 原生循环，单一解码缓存；进行中的不可取消解码可复用，意图版本号阻止迟到开声。
- 每轨增益、Fade Gain、Master Gain 独立；线性包络取消旧任务，避免渐弱破坏用户偏好。
- 计时以 performance.now 单调起点计算，AudioContext.currentTime 负责增益计划；JS 轮询只更新 UI 和清理，不能保证锁屏时钟行为。
- 声音配置与场景名称只存当前浏览器 jhaven.audio.v1，白名单校验；播放状态、计时截止点、日记、身份数据不保存或上传。
- 三条 Freesound 原页面分别核查 CC0；下载公开 HQ 预览后剪辑、下混、交叉渐变，静态自托管。专业听感仍待真机评估。
- Moodist 仅架构研究（MIT 代码、素材另查），独立实现；LeiBox 本轮无匹配音量组件。Impeccable 与 Anthropic 仅评估 README，不安装或执行外部 Skill。实际使用 leibox 与 Sites 本地开发流程。

## 5. 已知 Bug 与兼容性限制

| 问题                                                  | 影响                   | 优先级 | 状态                                                      |
| ----------------------------------------------------- | ---------------------- | ------ | --------------------------------------------------------- |
| 原生 fetch 作为类属性直接调用导致 Illegal invocation  | 浏览器首次无法加载音轨 | P1     | 已包装调用修复；真实 Chrome 非零 PCM 和 Edge 核心验证通过 |
| 详情返回重置混音、同配比自定义名称恢复不准确          | 状态一致性             | P2     | 已修复，新增回归覆盖                                      |
| 解码长时间无返回可能停在 loading                      | 可恢复性               | P2     | 已补合计 15 秒超时等待、迟到结果隔离与重试测试            |
| 移动端播放条遮住页脚隐私入口                          | 375px 导航             | P2     | 已补底部空间，三档截图无覆盖，入口可点击回归通过          |
| 系统 Chrome/Edge 外，Safari/Firefox/真机及锁屏未测    | 设备行为边界           | P2     | 内测前补测，不承诺整夜/锁屏可靠性                         |
| 21 秒素材循环、单声道与低音量听感未专业试听           | 产品音质与长期舒适性   | P2     | 后续真机听审，不虚报音质                                  |
| Context 在 idle/paused 时保留以复用；pagehide 才关闭  | 存活资源/功耗          | P3     | voice 已释放，三轨缓存有界；后续按测量评估空闲关闭        |
| 不跨标签页同步本地配置，不协调两个独立标签页播放      | 多标签页可能各自发声   | P3     | 当前边界，后续评估互斥控制                                |
| Playwright 自带 Chromium 下载曾停滞；Git 所有者不一致 | 本机工具限制           | P2     | 使用系统浏览器和单次 safe.directory，不修改全局配置       |

当前未发现阻断已测环境核心流程的问题；不把测试通过范围扩展成不存在其他缺陷的保证。

## 6. 最近一次测试结果

- 日期：2026-11-18（Asia/Macau），Windows / Node 24.21.0 / npm 11.19.0。
- `npm run check`：格式、ESLint、三包与工具类型检查、73/73 Vitest/API、生产构建通过；其中新增音频/持久化受控测试 38 项。
- `npm run audio:verify`：三条音轨的许可字段、SHA-256、大小、WAV 格式和时长通过，根构建前自动执行。
- Chrome：`PLAYWRIGHT_CHANNEL=chrome` 下 `npm run test:e2e` 通过；最后布局修改后 `npx playwright test` 对最终构建复测，51/51 通过，含 375/768/1440px、真实非零 PCM、实际 6 秒定时渐弱与故障恢复。
- Edge：`PLAYWRIGHT_CHANNEL=msedge` 下 `npx playwright test tests/e2e/audio.spec.ts --project=desktop-1440`，最终 7/7 核心音频用例通过。
- `npm run dev` 与三档视觉检查通过；最终无横向溢出、无页脚入口覆盖、无捕获到的 pageerror。Git diff/新增文件和常见密钥模式检查无异常，61 个变更文件均属于本任务；生成产物/原始 MP3 被忽略，没有暂存或提交。
- 修复过程包含原生 fetch 接收者、Mock Response 重用、SPA 返回测试时序与移动控制条遮挡；首次失败及端口冲突记录见 TESTING，不将其计作通过。
- 测试探针仅用于测试，使用真实 Web Audio 并以静音支路采样；故障注入验证拒绝播放，不对成功路径放宽自动播放策略。
- 未执行 Safari/Firefox、硬件听感、真实手机锁屏/整夜、生产 Nginx、MySQL 或认证测试；前者缺环境，后者未实现。

## 7. Sprint 3 任务与验收

1. 明确最小账户与会话方案，引入 MySQL 8.4、迁移执行器与参数化仓储；数据库连接使用 UTC。
2. 实现安全密码哈希、可撤销 HttpOnly/Secure/SameSite Cookie 会话、精确 Origin/CSRF 校验、登录与写入限流。
3. 实现简洁日记 CRUD、可选字段、本地日期和 IANA 时区、分页与输入长度校验。
4. 实现记录删除/账号删除与备份恢复策略；本地预设迁移账户前单独说明范围，不自动上传。
5. 验收：两个真实测试账户无法互读改删；跨用户、未认证、CSRF、非法输入及重复操作测试通过；无明文密码/令牌日志；音频回归继续通过。

Safari/真机音频听审与后台兼容性可作为内测准备并行事项，不以引入 AI 替代基础安全。

## 8. 最近一次开发记录

- 任务：Sprint 2 环境音引擎与声音场景。
- 新增：音频服务、类型、规则/存储、store/composable、6 个播放器组件、独立样式、原始页面署名和三条 WAV、制作/校验工具、受控与浏览器音频测试、AUDIO_ENGINE/AUDIO_ASSETS 文档。
- 修改：App 生命周期与跨路由控制、移动播放条底部空间、现有场景/首页/推荐/介绍文案、静态服务器音频 404、版本/锁文件/构建前校验和文档。
- 未修改：数据库业务、认证、AI；未新增 npm 依赖，未 commit/push/部署或改 Git 远端。
- 后续影响：正式静态产物必须包含 audio 目录与署名；账户模块不得自动上传当前本地配置或日记。

## 9. Git 版本信息

- 当前分支：main，跟踪 origin/main；origin=https://github.com/HendySen01/JHaven.git。
- 本轮开始已确认 Commit：beab93b5a14c3b89a64573705782373d242a8fb3，feat: build JHaven sleep home experience。
- 工作版本：0.1.0-alpha.2，Sprint 2 改动尚未提交，不填写本次不存在的 Commit Hash。
- 收尾仅只读 Git 检查；建议 feat: implement JHaven ambient audio engine，命令见 COMMIT_GUIDE。
