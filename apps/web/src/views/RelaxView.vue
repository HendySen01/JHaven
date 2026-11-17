<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue';
import AmbientSceneCard from '../components/AmbientSceneCard.vue';
import { scenes } from '../domain/evening';
import { useEveningStore } from '../stores/evening';
import { useAudioEngine } from '../composables/useAudioEngine';
const evening = useEveningStore();
const audio = useAudioEngine();
</script>
<template>
  <div class="wide-page page-enter">
    <RouterLink class="quiet-link back-link" to="/"
      ><ArrowLeft :size="16" aria-hidden="true" />回到今晚</RouterLink
    >
    <p class="eyebrow">CHOOSE YOUR EVENING</p>
    <h1 tabindex="-1">今晚，想在哪里停留？</h1>
    <p class="page-lead">选一处场景，或混合自己的夜晚。只有你点击播放，声音才会开始。</p>
    <div v-if="evening.recommendation" class="recommendation-banner">
      <strong>{{ evening.recommendation.title }}</strong>
      <p>{{ evening.recommendation.text }}</p>
      <RouterLink class="quiet-link" :to="evening.recommendation.to"
        >{{ evening.recommendation.action }}<span aria-hidden="true">↗</span></RouterLink
      >
    </div>
    <a class="quiet-link" href="#ambient-player">打开混音台<span aria-hidden="true">↓</span></a>
    <div class="scene-grid">
      <AmbientSceneCard
        v-for="scene in scenes"
        :key="scene.id"
        :scene="scene"
        :selected="audio.currentId === scene.id"
      />
    </div>
    <p class="gentle-note">场景选择只代表你的偏好，不是睡眠诊断或治疗建议。</p>
  </div>
</template>
