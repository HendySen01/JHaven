# 音频素材清单

## 本轮接入的六条录音（2026-11-20）

原始文件保留在忽略提交的 `artifacts/user-audio/`。导出均为 32 kHz 16 位单声道 PCM WAV。两条 CC0 替换轨使用原来的 ID 和公开 URL，旧合成文件另存于 `artifacts/user-audio-rendered/`。四条 MP3 已导出并接入本机试听与混音；作者及公开分发许可待核，四条 WAV 保留在忽略目录，不进入生产构建。

| ID             | 原始文件与格式                                                            | 原长 / 导出       | 分发范围            |
| -------------- | ------------------------------------------------------------------------- | ----------------- | ------------------- |
| `soft-chew`    | eating.wav，44.1 kHz、16 bit PCM 单声道                                   | 61.579 / 51 秒    | CC0 公开，89o_dev   |
| `fan`          | electric-desk-fan-start-up-run-and-stop.wav，96 kHz、24 bit PCM 单声道    | 24.216 / 10 秒    | CC0 公开，TimBahrij |
| `crunchy-chew` | crunchy-bite-and-chewing-sound-effect-eating-snack.mp3，48 kHz 立体声 MP3 | 32.496 / 28.25 秒 | 仅本机，授权待核    |
| `mouth-asmr`   | wet-mouth-sounds-asmr.mp3，48 kHz 立体声 MP3                              | 53.808 / 39 秒    | 仅本机，授权待核    |
| `lego-rustle`  | looking-through-lego-box-sound.mp3，48 kHz 立体声 MP3                     | 21.024 / 17.1 秒  | 仅本机，授权待核    |
| `leaf-steps`   | Feet in leaves.mp3，44.1 kHz 单声道 MP3                                   | 63.660 / 49.1 秒  | 仅本机，授权待核    |

两条已知来源分别为 [eating.wav](https://freesound.org/people/89o_dev/sounds/680180/) 和 [风扇实录](https://freesound.org/people/TimBahrij/sounds/191580/)。未从网络重新下载音频。Crispy Squishy 仍待真正外壳碎裂录音，`gentle-crinkle` 继续标为合成。

已生成的四条本机录音在 `npm run dev` 自动显示，用「本机录音」筛选。需要重做时执行 `node scripts/prepare-user-audio.mjs`，可用 `PLAYWRIGHT_CHANNEL=chrome` 选择系统 Chrome。预览时可用 `JHAVEN_LOCAL_AUDIO=1`，只为回环直连开放，公共构建不含这四个文件。在没有本机录音的环境打开旧预设时，会保留这些轨道的设置，但只播放可用的音轨。

## 历史记录

Sprint 9 已复核用户选定的两条 CC0 实录。Freesound 原件仍待登录获取，当前 12 条正式资源与 SHA-256 延续 Sprint 8。导入流程、试听链接和授权状态见 [音轨审计](AUDIO_AUDIT.md)。

审核日期 2026-11-19。目录共 12 条，文件均位于 `apps/web/public/audio/<ID>.wav`，格式为单声道 32 kHz、16 位 PCM WAV。物理设备听感另行复核。

2026-11-20 逐条复核与风扇、咀嚼及脆皮捏捏的候选见 [音轨审计与候选试听](AUDIO_AUDIT.md)。界面显示「柔和风扇声（合成）」「柔和颗粒声（合成）」和「轻脆碎响（合成）」。所有 WAV 和 ID 保留，两条实验音可用历史名称搜索。

## 轻柔拟音

| ID             | 当前名称           | 来源与许可                                  | 时长  | 使用方式               |
| -------------- | ------------------ | ------------------------------------------- | ----- | ---------------------- |
| soft-chew      | 柔和颗粒声（合成） | JHaven 原创合成，LicenseRef-JHaven-Original | 12 秒 | 用户主动试听或加入混音 |
| gentle-crinkle | 轻脆碎响（合成）   | JHaven 原创合成，LicenseRef-JHaven-Original | 12 秒 | 用户主动试听或加入混音 |

两条轨道由 `node scripts/prepare-textures.mjs` 生成，使用渐入渐出短包络，无第三方录音。拟音偏好因人而异，未加入默认场景和睡眠建议。

## 原有音轨

| ID          | 名称               | 作者及原始来源                                                                                              | 许可     | 时长  | 状态                     |
| ----------- | ------------------ | ----------------------------------------------------------------------------------------------------------- | -------- | ----- | ------------------------ |
| rain        | 雨声               | barkenov，[Soft rain.WAV](https://freesound.org/people/barkenov/sounds/640655/)                             | CC0-1.0  | 21 秒 | 原音重整后通过           |
| ocean       | 海浪               | SamsterBirdies，[Calm ocean waves](https://freesound.org/people/SamsterBirdies/sounds/578524/)              | CC0-1.0  | 21 秒 | 通过                     |
| wind        | 微风               | Nox_Sound，[林间风](https://freesound.org/people/Nox_Sound/sounds/530908/)                                  | CC0-1.0  | 21 秒 | 通过，录音可能有自然杂声 |
| window-rain | 窗边雨声           | SignatureSoundsOrg，[Rain_Hitting_Window_9](https://freesound.org/people/SignatureSoundsOrg/sounds/869851/) | CC0-1.0  | 21 秒 | 通过                     |
| stream      | 轻柔溪流           | SamsterBirdies，[Small brook](https://freesound.org/people/SamsterBirdies/sounds/584269/)                   | CC0-1.0  | 21 秒 | 通过                     |
| tide        | 远处潮汐           | apintofmild，[Distant waves breaking on the shore](https://freesound.org/people/apintofmild/sounds/866070/) | CC0-1.0  | 21 秒 | 通过                     |
| leaves      | 树叶沙沙声         | Borgory，[Soft Wind in the Trees](https://freesound.org/people/Borgory/sounds/751473/)                      | CC0-1.0  | 21 秒 | 通过                     |
| pink        | 粉红噪音           | JHaven，[合成脚本](../scripts/prepare-audio.mjs)                                                            | 项目自制 | 12 秒 | 通过                     |
| white       | 白噪音             | JHaven，[合成脚本](../scripts/prepare-audio.mjs)                                                            | 项目自制 | 12 秒 | 通过                     |
| fan         | 柔和风扇声（合成） | JHaven，[合成脚本](../scripts/prepare-audio.mjs)                                                            | 项目自制 | 12 秒 | 数字检查通过，实录待试听 |

七条实录已逐项核对 [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)，允许修改、再分发、商业使用，署名并非强制。项目保留作者与源链接。五条合成音仅使用项目算法，无第三方采样或署名义务，可随 JHaven 产品商用分发，未另外授予外部复用许可。精确来源、处理、下载及文件 SHA-256 在静态 manifest 和 ATTRIBUTION.txt。约 13.25 MB 随项目自托管，浏览器只加载选中的音轨。

新实录与原雨声由 Chrome OfflineAudioContext 对公开 HQ 预览第 5–29 秒下混，3 秒交叉渐变，6.5 kHz 低通、整体 RMS 调整及柔和峰值整形。保留原海浪和微风二进制。自制粉红噪音采用多速率噪声叠加，白噪音采用固定种子的宽带样本，风扇声用低通噪声和谐波近似。合成音去直流并进行等功率接缝处理。此处频率为音色处理参数。

数字审核通过 `npm run audio:verify`，检查 WAV、哈希、采样峰值、相邻样本跳变、50ms 电平突升、静音、直流和首尾接缝。原有十条 RMS −23.8 到 −21.0 dBFS。拟音 RMS 更低，各轨数字指标见命令输出。数字指标与物理设备听感分别验收。乐曲候选仍需素材、许可及听感审核。 [候选与文献](SOUND_EVIDENCE.md)

维护时显式执行 `node scripts/prepare-audio.mjs`，用 `PLAYWRIGHT_CHANNEL=chrome` 选择系统 Chrome。默认重做雨声并更新新增音轨，`--originals` 重建三条旧版处理文件。原预览存入忽略提交的 artifacts；构建不下载音频。不同浏览器重采样可能改变哈希，重新生成后提交前复核。
