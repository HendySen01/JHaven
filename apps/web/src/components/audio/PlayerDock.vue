<script setup lang="ts">
import { Play, Pause, Square } from '@lucide/vue';
import { useAudioEngine } from '../../composables/useAudioEngine';
const audio = useAudioEngine();
</script>
<template>
  <aside class="player-dock" aria-label="全局声音控制">
    <RouterLink to="/relax#ambient-player"
      ><span class="dock-scene-name" :title="audio.currentName">{{ audio.currentName }}</span
      ><small>{{
        audio.snapshot.status === 'playing'
          ? '正在播放'
          : audio.snapshot.status === 'paused'
            ? '已暂停'
            : audio.snapshot.status === 'error'
              ? '播放失败'
              : '准备 / 收声中'
      }}</small></RouterLink
    ><button
      class="icon-button"
      type="button"
      :aria-label="audio.snapshot.status === 'playing' ? '暂停声音' : '继续播放声音'"
      :disabled="audio.snapshot.status === 'loading' || audio.snapshot.status === 'stopping'"
      @click="audio.snapshot.status === 'playing' ? audio.pause() : audio.play()"
    >
      <Pause v-if="audio.snapshot.status === 'playing'" :size="18" aria-hidden="true" /><Play
        v-else
        :size="18"
        aria-hidden="true"
      /></button
    ><button class="icon-button" type="button" aria-label="停止声音" @click="audio.stop">
      <Square :size="16" aria-hidden="true" />
    </button>
  </aside>
</template>
