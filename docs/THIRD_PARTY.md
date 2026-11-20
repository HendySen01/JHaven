# 第三方来源与许可登记

Sprint 9.2 复用现有 Playwright、Web Audio 和 DeepSeek 适配器，音频校准继续使用已登记的 TimBahrij CC0 原件。响度测量参考 ITU-R BS.1770-5。无新增依赖、组件、素材或 Skills。 [测量及许可](AUDIO_ASSETS.md)

本轮使用已有 Playwright 和浏览器 Web Audio 解码本地音频，用现有 Vue 与 Vite 接入，无新增依赖。LeiBox Skill 索引查询未成功，沿用既有卡片和原生引用详情。两条 Freesound CC0 实录已集成，另外四条用户提供文件仅供本机使用。 [素材清单](AUDIO_ASSETS.md)

Sprint 9 收尾使用既有 Pinia、Vue 与原生 details。LeiBox Skill 目录本轮无法访问，未新增依赖或第三方组件。睡梦知识复核了原始研究及 NINDS 公开科普资料。 [知识说明](ASSISTANT.md)

Sprint 9 使用既有 Node Fetch、Zod 和 Playwright 实现供应商接口与素材制备。参考 DeepSeek 与 OpenAI 官方接口，无新增模型 SDK。LeiBox Skill 查询模型选择组件时远程索引不可达，使用原生 select 和现有样式。两条 Freesound CC0 原始 WAV 待获取，尚未集成；脆皮捏捏的跨平台结果均为审核记录。 [音轨来源](AUDIO_AUDIT.md)

Sprint 8 检查本机 LeiBox Skill 脚本并尝试查询 Vue 聊天输入。远程索引在本次环境无法访问，继续使用原生 textarea、Vue 和项目现有样式。Freesound 的两条 CC0 电风扇录音只进入候选列表。未新增外部素材、npm 依赖或 Skill。 [候选试听](AUDIO_AUDIT.md)

2026-11-20 使用 LeiBox Skill 查询 Vue 播放和聊天交互，检索到带工具与附件流程的聊天输入组件及强调动效的筛选组件。当前界面继续复用已有 Vue 控件、Lucide 和设计 token。未安装组件、依赖或额外 Skills。Freesound 原页面用于逐轨授权复核和候选试听。本轮无外部素材集成。 [音轨审计](AUDIO_AUDIT.md)

本轮用 LeiBox Skill 评估日期选择交互，目录匹配项面向日程卡片拖动。也评估了 `vue-scroll-picker` 的公开 Vue 3 接口和手势支持。为复用现有对话框并控制键盘、焦点和减少动态效果，采用项目内 Vue 与 CSS Scroll Snap 实现，未引入依赖或组件代码。 [vue-scroll-picker](https://github.com/wan2land/vue-scroll-picker)

限流分类参照 [DeepSeek 官方错误码](https://api-docs.deepseek.com/quick_start/error_codes/)。两条新拟音均为项目原创。

Sprint 6B 直接使用 DeepSeek 官方服务，复用 Node Fetch/SSE 代码，无新增 SDK、组件或 Skills。参考官方模型、流式接口与思考模式文档，接口服务的使用按供应商条款执行。 [官方文档](https://api-docs.deepseek.com/api/create-chat-completion/)

核查日期：2026-11-18。依赖版本以根锁文件为准；本文件不代替原许可。仓库公开、可下载、可署名不等于获得产品化授权。

## 已采用的依赖

| 直接依赖或工具                                | 用途                         | 许可证                                   | 原始来源                                                                                |
| --------------------------------------------- | ---------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| vue                                           | 前端运行时与 SFC             | MIT                                      | https://github.com/vuejs/core                                                           |
| vue-router                                    | 页面路由                     | MIT                                      | https://github.com/vuejs/router                                                         |
| pinia                                         | 跨组件服务状态               | MIT                                      | https://github.com/vuejs/pinia                                                          |
| @lucide/vue                                   | Lucide Vue 图标              | ISC；部分派生图标见包内 Feather MIT 声明 | https://github.com/lucide-icons/lucide                                                  |
| vite、@vitejs/plugin-vue                      | 开发服务器、SFC 与静态构建   | MIT                                      | https://github.com/vitejs/vite 、https://github.com/vitejs/vite-plugin-vue              |
| tailwindcss、@tailwindcss/vite                | 样式工具与 Vite 集成         | MIT                                      | https://github.com/tailwindlabs/tailwindcss                                             |
| express                                       | HTTP API                     | MIT                                      | https://github.com/expressjs/express                                                    |
| helmet                                        | 安全响应头                   | MIT                                      | https://github.com/helmetjs/helmet                                                      |
| zod                                           | 运行配置、输入与共享契约验证 | MIT                                      | https://github.com/colinhacks/zod                                                       |
| typescript                                    | 静态类型和服务构建           | Apache-2.0                               | https://github.com/microsoft/TypeScript                                                 |
| vue-tsc                                       | Vue SFC 类型检查             | MIT                                      | https://github.com/vuejs/language-tools                                                 |
| tsx                                           | 后端开发时运行 TypeScript    | MIT                                      | https://github.com/privatenumber/tsx                                                    |
| concurrently                                  | 跨平台管理本地三个监听进程   | MIT                                      | https://github.com/open-cli-tools/concurrently                                          |
| eslint、@eslint/js                            | 静态规则                     | MIT                                      | https://github.com/eslint/eslint                                                        |
| typescript-eslint                             | TypeScript 静态规则与解析    | MIT                                      | https://github.com/typescript-eslint/typescript-eslint                                  |
| eslint-plugin-vue、vue-eslint-parser          | Vue 静态规则与解析           | MIT                                      | https://github.com/vuejs/eslint-plugin-vue 、https://github.com/vuejs/vue-eslint-parser |
| globals                                       | ESLint 环境标识              | MIT                                      | https://github.com/sindresorhus/globals                                                 |
| prettier                                      | 一致格式                     | MIT                                      | https://github.com/prettier/prettier                                                    |
| vitest                                        | 独立逻辑与 API 测试运行器    | MIT                                      | https://github.com/vitest-dev/vitest                                                    |
| supertest                                     | HTTP 集成测试                | MIT                                      | https://github.com/forwardemail/supertest                                               |
| @playwright/test                              | 桌面与移动浏览器测试         | Apache-2.0                               | https://github.com/microsoft/playwright                                                 |
| @types/node、@types/express、@types/supertest | 相应运行时/测试类型          | MIT                                      | https://github.com/DefinitelyTyped/DefinitelyTyped                                      |

`@jhaven/*` 为本仓库自有代码，不是外部来源。`lucide-vue-next@1.0.0` 在首次安装时提示弃用，随后已替换并从依赖树移除。

间接依赖 `@vue/devtools-api@6.6.4` 的 npm 包未附 LICENSE 文件，已核对并补充其[对应版本上游 MIT 许可](https://raw.githubusercontent.com/vuejs/vue-devtools/v6.6.4/LICENSE)到 `docs/licenses/vue-devtools-api-6.6.4-LICENSE.txt`，随声明汇总一起分发。

完整锁文件依赖清单由 `npm run licenses:report` 基于锁文件和已安装包生成到 `DEPENDENCY_LICENSES.md`，包括开发与间接依赖、版本、许可证和来源。生产依赖的原始许可文本同时汇总到 `apps/web/public/THIRD_PARTY_NOTICES.txt`，Vite 构建会原样带入静态产物。发布时保留各 npm 包自带 LICENSE/NOTICE；自动清单不能代替许可证与素材权利审查。不同平台的可选二进制可能不安装，清单会明确标记需在目标平台复核的条目。

## LeiBox 检索与不采用的原因

- 仓库：https://github.com/leishifu666/LeiBox
- 实时目录：https://leibox.pantoria.cn/ai/search-index.json
- 使用本地 `leibox` skill 查询 Vue 按钮/胶囊导航，目录 revision 为 `ec051883c3d34df3327ccc7d3d34972cba515288c41efff69e0d838b1c30f73e`。
- 命中 `fluid-tooltip`、`blister-dropdown` 和 `glass-tab-menu`。前两者的展示交互不符合本阶段克制、简单导航的需要，未下载。
- 进一步读取 [Glass Tab Menu 详情](https://leibox.pantoria.cn/ai/components/glass-tab-menu.json)：支持 Vue；包声明仅依赖 `vue`；包含 Vue 组件、引擎 JS、motion runtime 和类型文件；来源为 LeiBox component package，设计参考作者 solutionb。
- 该条目 license 字段要求保留声明和设计参考署名，但明确没有目录级统一授权；不能据此确定全部素材/设计的修改与产品化权利。[仓库 COPYRIGHT](https://github.com/leishifu666/LeiBox/blob/main/COPYRIGHT.md) 也提示部分原设计许可未经独立核实。[仓库 LICENSE](https://github.com/leishifu666/LeiBox/blob/main/LICENSE.md) 含 Commons Clause 限制，不能笼统当作普通 MIT。
- **结论：未下载、未执行、未集成任何 LeiBox 组件源码、引擎脚本或素材。** 本阶段基础链接、按钮、布局和 CSS 夜景独立实现。将来若采用具体组件，应重新逐项核查，不以本次记录概括全仓库。

## 其他候选项目

| 候选                                 | 当前处理                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| https://github.com/remvze/moodist    | Sprint 1 阅读 README、package.json 与组件目录，参考声音/控制/工具/模态分开组织；不复制源码或音频 |
| https://github.com/vercel/ai         | AI 阶段候选；Alpha 不安装、不接接口，本次未复用源码                                              |
| https://github.com/anthropics/skills | 工作流程候选；本次未安装或复制，不将仓库许可假定为所有资产的统一许可                             |

## Sprint 1 资源评估记录

本轮不新增依赖，原已安装 Vue、Router、Pinia、Lucide、Tailwind 等继续使用，未修改第三方源码。新增组件与 CSS 插画独立实现，不将外部代码伪装为原创。

| 项目             | 地址                                  | 本轮用途                   | 许可核查                                                                                                       | 集成方式 / 源码修改                                             | 注意事项                                                                                                                                            |
| ---------------- | ------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| LeiBox           | https://github.com/leishifu666/LeiBox | Vue 设置/开关/导航候选检索 | 同一目录 revision；`fluid-tooltip` 未分配统一许可，完整产品化授权未确认                                        | 未下载或执行组件源码；未修改                                    | 本轮命中 elastic-panel-resize、fluid-tooltip；前者拖拽缩放无实际用途，后者 Vue 包需要 vue 与 gsap@3.12.7，包含引擎与 motion runtime；独立导航已足够 |
| Moodist          | https://github.com/remvze/moodist     | 页面与声音交互组织参考     | [代码 MIT](https://github.com/remvze/moodist/blob/main/LICENSE)，音频另有 CC0/Pixabay 等声明，不概括为统一 MIT | 仅研究 README、组件目录、package.json；无复制/修改/新增运行依赖 | 当前源码为 Astro/React，非直接 Vue 组件来源；借鉴声音、媒体控制、工具和模态分开的组织，播放留待 Sprint 2；未声称已经验证其音频许可                  |
| Impeccable       | https://github.com/pbakaus/impeccable | 评估 UI 质量检查能力       | 仓库展示 Apache-2.0，但本地可用 Skill 列表未提供                                                               | 只看 README；未安装或执行 Skill/安装脚本，无源码修改            | 本轮不额外引入执行权限与工具，使用现有工程检查、可访问交互测试与人工视觉核查                                                                        |
| Anthropic Skills | https://github.com/anthropics/skills  | 工作流候选评估             | 本轮未逐文件审查，不能概括整个仓库授权                                                                         | 未安装、未执行、未复制                                          | 当前已具备适用的本地 Skills，无需引入整套外部能力                                                                                                   |

实际使用的 Skills：`leibox` 用于实时目录与具体条目核查；`sites:sites` 仅使用现有仓库、本地验证流程，不注册 Site 或发布。未使用 Impeccable/Anthropic Skills，不安装未知脚本。相关限制不代表这些项目整体不可用于产品。

### Sprint 1 自有素材（历史）

月亮、山线、水面、页面布局、文案和 favicon 由本项目独立编写；无外部照片、音频、远程字体、商标或视频。Lucide 图标按上述许可保留声明。

## Sprint 2 音频资源与工具评估

本轮未新增 npm 依赖或第三方运行脚本，沿用现有 Vue/Pinia/Lucide、Vitest/Playwright。自有音频服务与组件独立实现，不修改第三方源码。

| 资源                       | 地址                                                           | 本轮实际用途                                                                          | 许可证/集成与修改                                            | 注意事项                                                                                             |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Moodist                    | https://github.com/remvze/moodist                              | 阅读 src/data/sounds、stores/sound/preset/sleep-timer、hooks/use-sound 与组件生命周期 | 代码 MIT；仅架构研究，未复制源码、素材或安装 Howler/React    | 借鉴音轨元数据/播放意图/预设分离和任务 token；原仓库没有逐条可确认的本轮音频来源链，因此未使用其 MP3 |
| Freesound / barkenov       | https://freesound.org/people/barkenov/sounds/640655/           | 雨声实录                                                                              | 原条目 CC0-1.0，下载公开 HQ 预览并剪辑/下混/交叉渐变后自托管 | 作者、地址、修改和文件 SHA-256 见 AUDIO_ASSETS 与 public/audio/manifest.json                         |
| Freesound / SamsterBirdies | https://freesound.org/people/SamsterBirdies/sounds/578524/     | 海浪实录                                                                              | 原条目 CC0-1.0，同上处理；不是从 Moodist 转取                | 无账号下载、无付费资源，保留自愿署名                                                                 |
| Freesound / Nox_Sound      | https://freesound.org/people/Nox_Sound/sounds/530908/          | 林间风实录                                                                            | 原条目 CC0-1.0，同上处理                                     | 可能包含自然树叶/鸟声，不伪称纯白噪音                                                                |
| MDN Web Audio 文档         | https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API | 核对 Context、Buffer/Source、Gain、resume、媒体元素与时钟边界                         | 仅技术参考，不复制示例代码或媒体                             | 本项目使用 AudioBufferSource 原生 loop 与增益自动化，未混用媒体元素方案                              |
| LeiBox                     | https://github.com/leishifu666/LeiBox                          | 使用本地 skill 重新检索音量/滑块/开关                                                 | 无合适音量条目，未下载源码或执行组件脚本                     | revision 与前轮一致；泛检索只命中其他用途滑块，精确音量无结果；使用原生 range/checkbox 独立实现      |
| Impeccable                 | https://github.com/pbakaus/impeccable                          | 重新评估 README 与现有 UI 的适配价值                                                  | 无本地对应 Skill，未安装/执行或复制                          | 保留现有设计，通过类型/交互/视觉检查；不为已有需求增加新安装权限                                     |
| Anthropic Skills           | https://github.com/anthropics/skills                           | 阅读 README 的独立 SKILL.md/资源组织方式                                              | 未安装、执行或复制任一 Skill                                 | 当前工具足够；没有据 README 对全仓库代码/素材作统一授权推断                                          |

三条原始页面已分别核查 [CC0](https://creativecommons.org/publicdomain/zero/1.0/) 标记与商业/修改/分发说明。素材清单见 AUDIO_ASSETS.md，静态署名在 apps/web/public/audio/ATTRIBUTION.txt；不暗示作者背书。语音/音乐/未知素材未引入。

实际使用 Skills：leibox 的实时查询与本地 Sites 开发/预览流程。未安装外部 Skill、未执行仓库安装脚本。制作工具为本仓库独立 Node 脚本，使用已安装 Playwright 和 Chrome 的 OfflineAudioContext；普通 npm 安装不下载素材，构建只做本地校验。

### 后续引入检查

记录具体文件/版本、原始链接、Vue 兼容性、运行与构建依赖、代码许可、素材许可、修改及商业使用条件、署名位置和验证结果。优先检查安装脚本和外部网络访问；不清楚则不引入，使用权利清晰的素材或独立实现。

## Sprint 2.5 声音库

新增四条 Freesound 实录，分别来自 SignatureSoundsOrg、SamsterBirdies、apintofmild 和 Borgory。分条 CC0 权利核验与处理记录见 [AUDIO_ASSETS](AUDIO_ASSETS.md)。稳定背景音为确定性项目自制。Moodist 只作信息组织参考，MDN 用于核对 Web Audio。LeiBox 和 Impeccable 查阅公开资料后沿用原生表单及现有夜间风格，未采用新的外部组件或技能脚本。

## Sprint 3 账户

`mysql2@3.24.6`（MIT）是唯一新直接依赖，用于池化连接、TLS 和参数化查询。第三方声明与传递依赖清单已重新生成。MySQL Community Server 9.6.0（GPL）为本机独立测试服务，项目发布物不包含服务器二进制。密码派生使用 Node 内置 scrypt。审查参考 OWASP 账户、会话和 CSRF 文档。Trail of Bits Skills、LeiBox 与 Impeccable 只评估公开材料，未安装、导入或执行。本轮未调用外部 Skills。 [mysql2 许可](https://github.com/sidorares/node-mysql2/blob/master/License)

## Sprint 4 资源评估

[Moodist](https://github.com/remvze/moodist) 作为场景管理参考。[Apache ECharts](https://github.com/apache/echarts) 仅评估，本任务的少量系列使用自建 SVG 和原生数据表。[LeiBox](https://github.com/leishifu666/LeiBox) 与 [Impeccable](https://github.com/pbakaus/impeccable) 仅查看官方项目说明。实际实现复用 Vue、Pinia、Zod、现有播放器和语义化表单，没有引入上述项目的代码、远程脚本、新依赖或外部 Skills。

## Sprint 6 资源说明

- 评估 Vercel AI SDK 的流式生成及供应商抽象（Apache-2.0），本阶段固定接一条 Chat Completions 接口，使用 Node 原生 Fetch 和独立适配器，无新增运行依赖。 [许可证](https://github.com/vercel/ai/blob/main/LICENSE) [流式生成文档](https://ai-sdk.dev/docs/ai-sdk-core/generating-text)
- 可选 OpenAI Chat Completions API 是第三方服务，默认关闭。本站只发送主动授权的有限输入，并验证返回的表达 ID。 [接口规范](https://developers.openai.com/api/reference/resources/chat) [数据政策](https://developers.openai.com/api/docs/guides/your-data)
- 助手界面复用现有 Vue、Lucide 与原生表单。本阶段无需额外引入 LeiBox、Impeccable 或安全审查 Skills，未安装其代码或运行脚本。

## Sprint 5 资源说明

- 练习界面复用现有 Vue 组件、原生 HTML 和项目样式。按当前可访问性及临时播放器状态需要，未集成额外的引导组件、LeiBox 或第三方 Skills。
- 语音使用浏览器 Web Speech API 的本机中文声线，无运行时依赖或外部语音集成。 [MDN 本机语音属性](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService)
- 指南及论文仅用于内容审核，练习文字为项目自行撰写。 [放松证据](RELAXATION_EVIDENCE.md)

## Sprint 7 资源说明

- 使用已安装的 LeiBox Skill 查询公开 Vue 组件目录。候选加载反馈依赖装饰性连续动效，沿用站内语义化状态提示。未下载或执行第三方组件。 [LeiBox](https://github.com/leishifu666/LeiBox)
- 查阅 Impeccable 公开项目说明评估设计审查流程，沿用既有设计系统和 Playwright 检查。未安装其 Skill，未新增 npm 依赖。 [Impeccable](https://github.com/pbakaus/impeccable)
- 参考浏览器原生音频中断及语音 API 文档。 [Web Audio 状态](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state) [语音暂停](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/pause)
