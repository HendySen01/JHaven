<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ArrowLeft, ArrowRight, Play } from '@lucide/vue';
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
function playScene() {
  if (!scene.value) return;
  const same = audio.currentId === scene.value.id;
  if (!same) audio.applyBuiltin(scene.value.id);
  if (same && audio.snapshot.status === 'playing') audio.pause();
  else void audio.play();
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
            点击播放此场景会应用它的起始配比。仅浏览不会改变当前混音；下方可独立调节、另存和设置定时。配比无医学含义。
          </p>
          <button
            class="button button-primary detail-play"
            type="button"
            :disabled="audio.snapshot.status === 'loading' || audio.snapshot.status === 'stopping'"
            @click="playScene"
          >
            <Play :size="17" aria-hidden="true" />{{
              audio.snapshot.status === 'playing' && audio.currentId === scene.id
                ? '暂停此场景'
                : '播放此场景'
            }}
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
