<script setup lang="ts">
import { Play, Pause, Square, LoaderCircle } from '@lucide/vue';
import { computed } from 'vue';
import { useAudioEngine } from '../../composables/useAudioEngine';
const audio = useAudioEngine();
const status = computed(() => audio.snapshot.status);
const labels = {
  idle: '尚未播放',
  loading: '正在准备声音…',
  playing: '正在播放',
  paused: '已暂停',
  stopping: '正在柔和收声…',
  error: '播放未能启动',
};
</script>
<template>
  <div class="player-control-row">
    <div class="player-status" role="status" aria-live="polite">
      <span
        class="player-status-dot"
        :class="{ 'is-playing': status === 'playing' }"
        aria-hidden="true"
      ></span
      >{{ labels[status] }}<span v-if="audio.snapshot.fading"> · 渐弱中</span
      ><span v-if="audio.masterVolume === 0"> · 总音量为零</span>
    </div>
    <div class="player-buttons">
      <button
        v-if="status === 'playing'"
        class="button button-primary"
        type="button"
        @click="audio.pause"
      >
        <Pause :size="17" aria-hidden="true" />暂停
      </button>
      <button
        v-else
        class="button button-primary"
        type="button"
        :disabled="
          status === 'loading' ||
          status === 'stopping' ||
          (!audio.selectedCount && !audio.auditionId)
        "
        @click="audio.play"
      >
        <component
          :is="status === 'loading' ? LoaderCircle : status === 'stopping' ? Square : Play"
          :size="17"
          aria-hidden="true"
        />{{
          status === 'loading'
            ? '正在准备'
            : status === 'stopping'
              ? '正在收声'
              : status === 'paused'
                ? '继续播放'
                : status === 'error'
                  ? '重试播放'
                  : '播放混音'
        }}
      </button>
      <button
        class="button button-secondary"
        type="button"
        :disabled="status === 'idle'"
        @click="audio.stop"
      >
        <Square :size="15" aria-hidden="true" />停止
      </button>
    </div>
  </div>
</template>
