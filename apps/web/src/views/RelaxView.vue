<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue';
import AmbientSceneCard from '../components/AmbientSceneCard.vue';
import { scenes } from '../domain/evening';
import { useEveningStore } from '../stores/evening';
const evening = useEveningStore();
</script>
<template>
  <div class="wide-page page-enter">
    <RouterLink class="quiet-link back-link" to="/"
      ><ArrowLeft :size="16" aria-hidden="true" />回到今晚</RouterLink
    >
    <p class="eyebrow">CHOOSE YOUR EVENING</p>
    <h1 tabindex="-1">今晚，想在哪里停留？</h1>
    <p class="page-lead">选一处场景，看看它的氛围。不需要立刻做决定。</p>
    <div v-if="evening.recommendation" class="recommendation-banner">
      <strong>{{ evening.recommendation.title }}</strong>
      <p>{{ evening.recommendation.text }}</p>
      <RouterLink class="quiet-link" :to="evening.recommendation.to"
        >{{ evening.recommendation.action }}<span aria-hidden="true">↗</span></RouterLink
      >
    </div>
    <p class="preview-notice">视觉预览 · 音频引擎待开发，当前不会播放声音。</p>
    <div class="scene-grid">
      <AmbientSceneCard
        v-for="scene in scenes"
        :key="scene.id"
        :scene="scene"
        :selected="evening.selectedScene === scene.id"
      />
    </div>
    <p class="gentle-note">场景选择只代表你的偏好，不是睡眠诊断或治疗建议。</p>
  </div>
</template>
