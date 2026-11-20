<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ArrowLeft, ArrowRight, Play, Pause, LoaderCircle, Square } from '@lucide/vue';
import SceneArtwork from '../components/SceneArtwork.vue';
import { findScene } from '../domain/evening';
import { useEveningStore } from '../stores/evening';
import { useAudioEngine } from '../composables/useAudioEngine';
const audio = useAudioEngine();
const route = useRoute();
const evening = useEveningStore();
const scene = computed(() => findScene(route.params.sceneId));
watch(
  scene,
  (value) => {
    if (value) {
      evening.selectedScene = value.id;
    }
  },
  { immediate: true },
);
const isCurrentMix = computed(
  () => audio.currentId === null || audio.currentId === scene.value?.id,
);
const status = computed(() => audio.snapshot.status);
const busy = computed(
  () => status.value === 'loading' || status.value === 'stopping' || !!audio.auditionId,
);
const pause = computed(() => isCurrentMix.value && status.value === 'playing' && !audio.auditionId);
const icon = computed(() =>
  status.value === 'loading'
    ? LoaderCircle
    : status.value === 'stopping' || audio.auditionId
      ? Square
      : pause.value
        ? Pause
        : Play,
);
const buttonText = computed(() => {
  if (audio.auditionId) return '正在单独试听';
  if (status.value === 'loading') return '正在准备声音…';
  if (status.value === 'stopping') return '正在收声…';
  if (!isCurrentMix.value) return '切换并播放此场景';
  if (status.value === 'error') return '重试播放';
  if (status.value === 'paused') return '继续播放';
  if (audio.currentId === null) return pause.value ? '暂停当前混音' : '播放当前混音';
  return pause.value ? '暂停此场景' : '播放此场景';
});
function playScene() {
  if (!scene.value || busy.value) return;
  if (pause.value) {
    audio.pause();
    return;
  }
  if (!isCurrentMix.value) audio.applyBuiltin(scene.value.id);
  void audio.play();
}
</script>
<template>
  <div class="wide-page page-enter">
    <RouterLink class="quiet-link back-link" to="/relax"
      ><ArrowLeft :size="16" aria-hidden="true" />返回场景选择</RouterLink
    >
    <template v-if="scene">
      <div class="scene-detail">
        <div class="detail-art">
          <SceneArtwork :scene="scene.id" /><span class="detail-preview-badge"
            >CC0 实录 · 可混合播放</span
          >
        </div>
        <section class="detail-copy" aria-labelledby="scene-title">
          <p class="eyebrow">{{ scene.english }}</p>
          <h1 id="scene-title" tabindex="-1">{{ scene.name }}</h1>
          <p class="detail-mood">{{ scene.mood }}</p>
          <p class="page-lead">{{ scene.description }}</p>
          <p class="scene-texture">{{ scene.texture }}</p>
          <p class="audio-hint">
            手动调过的混音会继续保留。可在下方选择预设、调节音量、另存或设置定时。
          </p>
          <button
            class="button button-primary detail-play"
            type="button"
            :disabled="busy"
            @click="playScene"
          >
            <component :is="icon" :size="17" aria-hidden="true" />{{ buttonText }}
          </button>
          <RouterLink class="button button-secondary" to="/relax"
            >再看看其他场景<ArrowRight :size="16" aria-hidden="true"
          /></RouterLink>
        </section>
      </div>
      <p class="gentle-note">无需赶走思绪，也不必努力入睡。按自己的节奏，留一会儿就好。</p>
    </template>
    <template v-else
      ><p class="eyebrow">A LITTLE DETOUR</p>
      <h1 tabindex="-1">这处场景还不存在。</h1>
      <p class="page-lead">可以返回选择雨夜、海岸或微风。</p></template
    >
  </div>
</template>
