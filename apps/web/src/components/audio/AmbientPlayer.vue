<script setup lang="ts">
import { computed, ref } from 'vue';
import { AudioLines, Trash2 } from '@lucide/vue';
import { availableTrackIds, localTrackIds, TRACKS } from '../../types/audio';
import { BUILTIN_PRESETS, trackNotes } from '../../domain/audio';
import { useAudioEngine } from '../../composables/useAudioEngine';
import AudioTrackControl from './AudioTrackControl.vue';
import PlayerControls from './PlayerControls.vue';
import VolumeSlider from './VolumeSlider.vue';
import SleepTimer from './SleepTimer.vue';
const audio = useAudioEngine();
const name = ref('');
const query = ref('');
const category = ref('all');
const hasLocalRecordings = availableTrackIds.some((id) => localTrackIds.includes(id));
const visibleTracks = computed(() => {
  const search = query.value.trim().toLowerCase();
  return availableTrackIds.filter((id) => {
    const track = TRACKS[id];
    const matchesCategory =
      category.value === 'all' ||
      category.value === track.category ||
      (category.value === 'local' && localTrackIds.includes(id)) ||
      (category.value === 'favorites' && audio.favorites.includes(id));
    const names = [track.name, track.english, ...(trackNotes[id]?.aliases ?? [])];
    return matchesCategory && names.some((name) => name.toLowerCase().includes(search));
  });
});
function save() {
  if (audio.savePreset(name.value)) name.value = '';
}
</script>
<template>
  <section id="ambient-player" class="ambient-player" aria-labelledby="player-title">
    <div class="player-heading">
      <div>
        <h2 id="player-title">
          <AudioLines :size="24" aria-hidden="true" />{{ audio.currentName }}
        </h2>
      </div>
      <RouterLink class="quiet-link" to="/sound-evidence">关于这些声音</RouterLink>
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
    <div class="master-volume">
      <VolumeSlider label="总音量" :value="audio.masterVolume" @change="audio.setMaster" />
      <button
        class="sound-action"
        type="button"
        :aria-pressed="audio.masterVolume === 0"
        @click="audio.toggleMute"
      >
        {{ audio.masterVolume === 0 ? '取消静音' : '静音' }}
      </button>
    </div>
    <div class="library-transport"><PlayerControls /></div>
    <p v-if="audio.snapshot.error" class="audio-feedback" role="alert">
      {{ audio.snapshot.error }}
    </p>
    <div class="sound-filters">
      <label
        >搜索声音
        <input v-model="query" type="search" maxlength="60" placeholder="试试雨声、风扇或积木"
      /></label>
      <label
        >声音分类
        <select v-model="category">
          <option value="all">全部声音</option>
          <option value="nature">自然实录</option>
          <option value="steady">稳定背景音</option>
          <option value="texture">近距离细响</option>
          <option v-if="hasLocalRecordings" value="local">本机录音</option>
          <option value="favorites">我的收藏</option>
        </select></label
      >
    </div>
    <p class="audio-hint">想单独听听？先停下混音。试听 12 秒后会自动收声。</p>
    <p v-if="audio.auditionId" class="audio-hint">单轨试听 · {{ TRACKS[audio.auditionId].name }}</p>
    <p v-if="!visibleTracks.length" class="audio-hint" role="status">没有匹配的声音。</p>
    <div class="audio-track-grid sound-grid">
      <AudioTrackControl
        v-for="id in visibleTracks"
        :id="id"
        :key="id"
        :track="audio.snapshot.tracks[id]"
        :mix="audio.mix[id]"
        :favorite="audio.favorites.includes(id)"
        :can-audition="audio.snapshot.status === 'idle'"
        :auditioning="audio.auditionId === id"
        @audition="audio.auditionId === id ? audio.stop() : audio.audition(id)"
        @favorite="audio.toggleFavorite(id)"
        @toggle="audio.updateTrack(id, { enabled: !audio.mix[id].enabled })"
        @volume="audio.updateTrack(id, { volume: $event })"
      />
    </div>
    <p v-if="!audio.selectedCount" class="audio-feedback">请至少开启一条音轨，再开始播放。</p>
    <p v-if="audio.snapshot.notice" class="audio-hint">{{ audio.snapshot.notice }}</p>
    <SleepTimer v-if="!audio.auditionId" />
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
      <a href="/audio/ATTRIBUTION.txt" target="_blank" rel="noopener">声音来源与许可</a
      >。建议从较低设备音量开始，按自己的感受调整。
    </p>
  </section>
</template>
