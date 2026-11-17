<script setup lang="ts">
import { ArrowUpRight, CloudRain, Waves, Wind, Check } from '@lucide/vue';
import type { Scene } from '../domain/evening';
import SceneArtwork from './SceneArtwork.vue';
defineProps<{ scene: Scene; selected?: boolean }>();
const icons = { rain: CloudRain, waves: Waves, wind: Wind };
</script>
<template>
  <RouterLink
    :to="`/relax/${scene.id}`"
    class="scene-card"
    :class="{ 'scene-selected': selected }"
    :aria-label="`查看${scene.name}场景`"
  >
    <div class="scene-art-wrap">
      <SceneArtwork :scene="scene.id" />
      <span class="scene-preview-label">视觉预览</span>
      <span v-if="selected" class="scene-selected-label"
        ><Check :size="12" aria-hidden="true" />已选场景</span
      >
    </div>
    <div class="scene-card-content">
      <p class="card-subtitle">{{ scene.english }}</p>
      <div class="scene-card-title">
        <h3>
          <component :is="icons[scene.icon]" :size="20" :stroke-width="1.4" aria-hidden="true" />{{
            scene.name
          }}
        </h3>
        <ArrowUpRight :size="19" aria-hidden="true" />
      </div>
      <p>{{ scene.mood }}</p>
      <div class="scene-card-foot">
        <span>{{ scene.texture }}</span><span>音频待开放</span>
      </div>
    </div>
  </RouterLink>
</template>
