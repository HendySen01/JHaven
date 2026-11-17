# 音频素材清单

审核日期 2026-11-18。目录共 10 条，文件均位于 `apps/web/public/audio/<ID>.wav`，格式为单声道 32 kHz、16 位 PCM WAV。全部通过许可和数字质量审核，物理设备听感另行复核。

| ID          | 名称       | 作者及原始来源                                                                                              | 许可     | 时长  | 状态                     |
| ----------- | ---------- | ----------------------------------------------------------------------------------------------------------- | -------- | ----- | ------------------------ |
| rain        | 雨声       | barkenov，[Soft rain.WAV](https://freesound.org/people/barkenov/sounds/640655/)                             | CC0-1.0  | 21 秒 | 原音重整后通过           |
| ocean       | 海浪       | SamsterBirdies，[Calm ocean waves](https://freesound.org/people/SamsterBirdies/sounds/578524/)              | CC0-1.0  | 21 秒 | 通过                     |
| wind        | 微风       | Nox_Sound，[林间风](https://freesound.org/people/Nox_Sound/sounds/530908/)                                  | CC0-1.0  | 21 秒 | 通过，录音可能有自然杂声 |
| window-rain | 窗边雨声   | SignatureSoundsOrg，[Rain_Hitting_Window_9](https://freesound.org/people/SignatureSoundsOrg/sounds/869851/) | CC0-1.0  | 21 秒 | 通过                     |
| stream      | 轻柔溪流   | SamsterBirdies，[Small brook](https://freesound.org/people/SamsterBirdies/sounds/584269/)                   | CC0-1.0  | 21 秒 | 通过                     |
| tide        | 远处潮汐   | apintofmild，[Distant waves breaking on the shore](https://freesound.org/people/apintofmild/sounds/866070/) | CC0-1.0  | 21 秒 | 通过                     |
| leaves      | 树叶沙沙声 | Borgory，[Soft Wind in the Trees](https://freesound.org/people/Borgory/sounds/751473/)                      | CC0-1.0  | 21 秒 | 通过                     |
| pink        | 粉红噪音   | JHaven，[合成脚本](../scripts/prepare-audio.mjs)                                                            | 项目自制 | 12 秒 | 通过                     |
| white       | 白噪音     | JHaven，[合成脚本](../scripts/prepare-audio.mjs)                                                            | 项目自制 | 12 秒 | 通过                     |
| fan         | 柔和风扇声 | JHaven，[合成脚本](../scripts/prepare-audio.mjs)                                                            | 项目自制 | 12 秒 | 通过                     |

七条实录已逐项核对 [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)，允许修改、再分发、商业使用，署名并非强制。项目保留作者与源链接。三条合成音仅使用项目算法，无第三方采样或署名义务，可随 JHaven 产品商用分发，未另外授予外部复用许可。精确来源、处理、下载及文件 SHA-256 在静态 manifest 和 ATTRIBUTION.txt。约 11.71 MB 随项目自托管，浏览器只加载选中的音轨。

新实录与原雨声由 Chrome OfflineAudioContext 对公开 HQ 预览第 5–29 秒下混，3 秒交叉渐变，6.5 kHz 低通、整体 RMS 调整及柔和峰值整形。保留原海浪和微风二进制。自制粉红噪音采用多速率噪声叠加，白噪音采用固定种子的宽带样本，风扇声用低通噪声和谐波近似。合成音去直流并进行等功率接缝处理。此处频率为音色处理参数。

数字审核通过 `npm run audio:verify`，检查 WAV、哈希、采样峰值、相邻样本跳变、50ms 电平突升、静音、直流和首尾接缝。当前 RMS −23.8 到 −21.0 dBFS，最高峰值 0.65，最大 50ms 电平突升 10.1 dB，无低于 −55 dBFS 的 50ms 窗，接缝跳变最大 0.1307。数字指标不等于 LUFS、扬声器声压或人工听感。乐曲候选仍需素材、许可及听感审核。 [候选与文献](SOUND_EVIDENCE.md)

维护时显式执行 `node scripts/prepare-audio.mjs`，用 `PLAYWRIGHT_CHANNEL=chrome` 选择系统 Chrome。默认重做雨声并更新新增音轨，`--originals` 重建三条旧版处理文件。原预览存入忽略提交的 artifacts；构建不下载音频。不同浏览器重采样可能改变哈希，重新生成后提交前复核。
