# 音频素材清单

核查日期：2026-11-18。三条均为具体原始页面明确标注 **CC0-1.0** 的环境实录，已取得公开 HQ MP3 预览并制作本地循环 WAV。没有使用 Moodist 仓库的音频，也没有从代码 MIT 许可推断素材授权。

| 应用名称   | 原作 / 作者                                        | 原始来源                                                   | 许可    | 文件                              | 格式与说明                                                     |
| ---------- | -------------------------------------------------- | ---------------------------------------------------------- | ------- | --------------------------------- | -------------------------------------------------------------- |
| Rain 雨声  | Soft rain.WAV / barkenov                           | https://freesound.org/people/barkenov/sounds/640655/       | CC0-1.0 | `apps/web/public/audio/rain.wav`  | 花园雨声实录，21s、32kHz、16-bit mono WAV                      |
| Ocean 海浪 | Calm ocean waves / SamsterBirdies                  | https://freesound.org/people/SamsterBirdies/sounds/578524/ | CC0-1.0 | `apps/web/public/audio/ocean.wav` | Whidbey Island 海浪实录，21s、32kHz、16-bit mono WAV           |
| Wind 微风  | Ambiance_Wind_Forest_Trees_Loop_01.wav / Nox_Sound | https://freesound.org/people/Nox_Sound/sounds/530908/      | CC0-1.0 | `apps/web/public/audio/wind.wav`  | 林间风实录，可能包含自然树叶/鸟声；21s、32kHz、16-bit mono WAV |

[CC0 说明与法律文本入口](https://creativecommons.org/publicdomain/zero/1.0/)允许复制、修改、分发和商业使用，无强制署名；本项目仍保留作者与来源以便追溯，不暗示作者背书。

每条文件 1,344,044 字节，合计 4,032,132 字节。精确下载地址、原预览及产物 SHA-256、原预览时长、处理备注见 `apps/web/public/audio/manifest.json`；可分发署名见同目录 `ATTRIBUTION.txt`，播放器直接链接此文件。

## 已执行的处理

使用 `scripts/prepare-audio.mjs` 与真实 Chrome 的 OfflineAudioContext 处理：取公开预览第 5–29 秒，下混单声道至 32kHz；尾部与片头 3 秒线性交叉渐变，输出 21 秒循环；峰值归一到 0.65，写 PCM WAV。无新增音效库、音乐、雷声或语音。不是 LUFS 校准，不宣称已完成专业听感母带或真机音量验证。

未复制源站 HTML、图片或商标。原始预览只缓存在忽略提交的 `artifacts/audio-sources`；常规开发/构建使用已提交 WAV，不热链，不依赖源站在线。

维护者需要重新制作时，显式设置浏览器频道后执行 `node scripts/prepare-audio.mjs`，核对输出并运行 `npm run audio:verify`。脚本联网并生成文件，不作为安装脚本自动执行。不同浏览器解码/重采样可能产生不同哈希，重新生成须人工核查后更新清单，不在 CI 静默改写资源。

## 后续素材质量工作

当前三条授权与播放能力已具备；专业耳机/扬声器听感、循环自然程度、长时单调感与真机低音量仍需内测反馈。不能把自动化解码与非零样本验证说成专业听审完成。后续换素材必须逐条重新检查许可、作者、再分发和修改条件，并更新清单与校验值。
