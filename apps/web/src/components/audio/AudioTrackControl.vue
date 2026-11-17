<script setup lang="ts">
import { CloudRain, Waves, Wind } from '@lucide/vue';
import { TRACKS, type TrackId, type TrackSnapshot } from '../../types/audio';
import VolumeSlider from './VolumeSlider.vue';
defineProps<{ id: TrackId; track: TrackSnapshot }>();
defineEmits<{ toggle: []; volume: [value: number] }>();
const icons = { rain: CloudRain, ocean: Waves, wind: Wind };
const loadLabels = { idle: '待播放', loading: '正在加载…', ready: '已就绪', error: '加载失败' };
</script>
<template>
  <div class="audio-track" :class="{ 'track-enabled': track.enabled }">
    <div class="track-heading">
      <span
        ><component :is="icons[id]" :size="21" aria-hidden="true" /><strong>{{
          TRACKS[id].name
        }}</strong></span
      ><label class="track-switch"
        ><span class="sr-only">{{ `开启${TRACKS[id].name}` }}</span
        ><input
          type="checkbox"
          role="switch"
          :checked="track.enabled"
          :aria-label="`开启${TRACKS[id].name}`"
          @change="$emit('toggle')"
      /></label>
    </div>
    <VolumeSlider
      :label="`${TRACKS[id].name}音量`"
      :value="track.volume"
      :disabled="!track.enabled"
      @change="$emit('volume', $event)"
    />
    <p class="track-load" :class="{ 'track-error': track.error }">
      {{ track.enabled ? loadLabels[track.loadStatus] : '已关闭'
      }}<span v-if="track.error"> · {{ track.error }}</span>
    </p>
  </div>
</template>
