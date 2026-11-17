<script setup lang="ts">
import { AudioLines, CloudRain, Heart, Play, Waves, Wind } from '@lucide/vue';
import { TRACKS, type TrackId, type TrackSnapshot } from '../../types/audio';
import VolumeSlider from './VolumeSlider.vue';
defineProps<{
  id: TrackId;
  track: TrackSnapshot;
  favorite: boolean;
  canAudition: boolean;
  auditioning: boolean;
}>();
defineEmits<{ toggle: []; volume: [value: number]; favorite: []; audition: [] }>();
const icons = { rain: CloudRain, ocean: Waves, wind: Wind } as const;
const loadLabels = { idle: '待播放', loading: '正在加载…', ready: '已就绪', error: '加载失败' };
</script>
<template>
  <div class="audio-track" :class="{ 'track-enabled': track.enabled }">
    <div class="track-heading">
      <span
        ><component
          :is="id in icons ? icons[id as keyof typeof icons] : AudioLines"
          :size="21"
          aria-hidden="true"
        /><strong>{{ TRACKS[id].name }}</strong></span
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
    <div class="sound-actions">
      <button
        class="sound-action"
        type="button"
        :disabled="!canAudition && !auditioning"
        :aria-label="`${auditioning ? '停止试听' : '试听'}${TRACKS[id].name}`"
        @click="$emit('audition')"
      >
        <Play :size="14" aria-hidden="true" />{{ auditioning ? '停止试听' : '试听' }}
      </button>
      <button
        class="sound-action"
        type="button"
        :aria-pressed="favorite"
        :aria-label="`收藏${TRACKS[id].name}`"
        @click="$emit('favorite')"
      >
        <Heart :size="15" :fill="favorite ? 'currentColor' : 'none'" aria-hidden="true" />收藏
      </button>
    </div>
  </div>
</template>
