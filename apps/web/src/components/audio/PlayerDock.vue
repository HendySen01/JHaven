<script setup lang="ts">
import { Play, Pause, Square, LoaderCircle } from '@lucide/vue';
import { computed } from 'vue';
import { TRACKS } from '../../types/audio';
import { useAudioEngine } from '../../composables/useAudioEngine';
const audio = useAudioEngine();
const title = computed(() =>
  audio.auditionId ? '试听 · ' + TRACKS[audio.auditionId].name : audio.currentName,
);
const status = computed(() => audio.snapshot.status);
const statusText = computed(
  () =>
    ({
      idle: '尚未播放',
      loading: '正在准备声音',
      playing: '正在播放',
      paused: '已暂停',
      stopping: '正在收声',
      error: '播放失败',
    })[status.value],
);
const buttonText = computed(
  () =>
    ({
      idle: '播放声音',
      loading: '正在准备声音',
      playing: '暂停声音',
      paused: '继续播放声音',
      stopping: '正在收声',
      error: '重试声音',
    })[status.value],
);
const icon = computed(() =>
  status.value === 'playing'
    ? Pause
    : status.value === 'loading'
      ? LoaderCircle
      : status.value === 'stopping'
        ? Square
        : Play,
);
</script>
<template>
  <aside class="player-dock" aria-label="全局声音控制">
    <RouterLink to="/relax#ambient-player"
      ><span class="dock-scene-name" :title="title">{{ title }}</span
      ><small role="status">{{ statusText }}</small></RouterLink
    ><button
      class="icon-button"
      type="button"
      :aria-label="buttonText"
      :disabled="audio.snapshot.status === 'loading' || audio.snapshot.status === 'stopping'"
      @click="audio.snapshot.status === 'playing' ? audio.pause() : audio.play()"
    >
      <component :is="icon" :size="18" aria-hidden="true" /></button
    ><button class="icon-button" type="button" aria-label="停止声音" @click="audio.stop">
      <Square :size="16" aria-hidden="true" />
    </button>
  </aside>
</template>
