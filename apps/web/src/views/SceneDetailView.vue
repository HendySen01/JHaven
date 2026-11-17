<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ArrowLeft, ArrowRight, VolumeX } from '@lucide/vue';
import SceneArtwork from '../components/SceneArtwork.vue';
import { findScene } from '../domain/evening';
import { useEveningStore } from '../stores/evening';
const route = useRoute();
const evening = useEveningStore();
const scene = computed(() => findScene(route.params.sceneId));
watch(
  scene,
  (value) => {
    if (value) evening.selectedScene = value.id;
  },
  { immediate: true },
);
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
            >视觉预览 · 无音频</span
          >
        </div>
        <section class="detail-copy" aria-labelledby="scene-title">
          <p class="eyebrow">{{ scene.english }}</p>
          <h1 id="scene-title" tabindex="-1">{{ scene.name }}</h1>
          <p class="detail-mood">{{ scene.mood }}</p>
          <p class="page-lead">{{ scene.description }}</p>
          <p class="scene-texture">{{ scene.texture }}</p>
          <div class="audio-unavailable">
            <VolumeX :size="19" aria-hidden="true" />
            <div>
              <strong>真实声音，还在路上</strong>
              <p>本阶段仅可选择和浏览场景。音频、多轨混合与定时停止将在后续 Sprint 实现。</p>
            </div>
          </div>
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
