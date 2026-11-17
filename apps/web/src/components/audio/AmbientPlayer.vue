<script setup lang="ts">
import { ref } from 'vue';
import { AudioLines, Trash2 } from '@lucide/vue';
import { TRACK_IDS } from '../../types/audio';
import { BUILTIN_PRESETS } from '../../domain/audio';
import { useAudioEngine } from '../../composables/useAudioEngine';
import AudioTrackControl from './AudioTrackControl.vue';
import PlayerControls from './PlayerControls.vue';
import VolumeSlider from './VolumeSlider.vue';
import SleepTimer from './SleepTimer.vue';
const audio = useAudioEngine();
const name = ref('');
function save() {
  if (audio.savePreset(name.value)) name.value = '';
}
</script>
<template>
  <section id="ambient-player" class="ambient-player" aria-labelledby="player-title">
    <div class="player-heading">
      <div>
        <p class="eyebrow">YOUR NIGHT, YOUR MIX</p>
        <h2 id="player-title">
          <AudioLines :size="24" aria-hidden="true" />{{ audio.currentName }}
        </h2>
      </div>
      <span class="audio-source-label">三条实录 · CC0 授权</span>
    </div>
    <div class="preset-pills" aria-label="内置声音预设">
      <button
        v-for="preset in BUILTIN_PRESETS"
        :key="preset.id"
        type="button"
        :aria-pressed="audio.currentId === preset.id"
        @click="audio.applyPreset(preset)"
      >
        {{ preset.name }}
      </button>
    </div>
    <div class="audio-track-grid">
      <AudioTrackControl
        v-for="id in TRACK_IDS"
        :id="id"
        :key="id"
        :track="audio.snapshot.tracks[id]"
        @toggle="audio.updateTrack(id, { enabled: !audio.mix[id].enabled })"
        @volume="audio.updateTrack(id, { volume: $event })"
      />
    </div>
    <div class="master-volume">
      <VolumeSlider label="总音量" :value="audio.masterVolume" @change="audio.setMaster" />
    </div>
    <PlayerControls />
    <p v-if="!audio.selectedCount" class="audio-feedback">请至少开启一条音轨，再开始播放。</p>
    <p v-if="audio.snapshot.error" class="audio-feedback" role="alert">
      {{ audio.snapshot.error }}
    </p>
    <p v-if="audio.snapshot.notice" class="audio-hint">{{ audio.snapshot.notice }}</p>
    <SleepTimer />
    <section class="saved-presets" aria-labelledby="saved-title">
      <h3 id="saved-title">留住你喜欢的混音</h3>
      <form class="preset-save-form" @submit.prevent="save">
        <label class="sr-only" for="preset-name">自定义场景名称</label
        ><input
          id="preset-name"
          v-model="name"
          type="text"
          maxlength="40"
          required
          placeholder="给这个夜晚起个名字"
          autocomplete="off"
        /><button type="submit" class="button button-secondary">另存场景</button>
      </form>
      <p v-if="audio.formMessage" class="audio-hint" role="status">{{ audio.formMessage }}</p>
      <ul v-if="audio.presets.length" class="custom-preset-list">
        <li v-for="preset in audio.presets" :key="preset.id">
          <button
            type="button"
            class="custom-preset-name"
            :aria-pressed="audio.currentId === preset.id"
            @click="audio.applyPreset(preset)"
          >
            {{ preset.name }}</button><button
            type="button"
            class="icon-button"
            :aria-label="`删除场景 ${preset.name}`"
            @click="audio.deletePreset(preset.id)"
          >
            <Trash2 :size="15" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <p v-else class="audio-hint">还没有自定义场景。调整音轨后，可保存到当前浏览器。</p>
      <p class="audio-hint">{{ audio.storageMessage }}</p>
    </section>
    <p class="audio-credit">
      录音：barkenov、SamsterBirdies、Nox_Sound ·
      <a href="/audio/ATTRIBUTION.txt" target="_blank" rel="noopener">来源与 CC0 授权</a
      >。建议从较低设备音量开始，按自己的感受调整。
    </p>
  </section>
</template>
