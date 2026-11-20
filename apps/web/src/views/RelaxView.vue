<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue';
import { computed, ref } from 'vue';
import AmbientSceneCard from '../components/AmbientSceneCard.vue';
import { moods, scenes } from '../domain/evening';
import { useEveningStore } from '../stores/evening';
import { useAudioEngine } from '../composables/useAudioEngine';
import { practices } from '../domain/relaxation';
import { usePracticeRecommendation } from '../composables/usePracticeRecommendation';
import { BUILTIN_PRESETS } from '../domain/audio';
const evening = useEveningStore();
const audio = useAudioEngine();
const skipped = ref(false);
const guidance = usePracticeRecommendation();
const sound = computed(
  () =>
    guidance.value.saved?.name ??
    BUILTIN_PRESETS.find((preset) => preset.id === guidance.value.scene)?.name ??
    '静音',
);
</script>
<template>
  <div class="wide-page page-enter">
    <RouterLink class="quiet-link back-link" to="/">
      <ArrowLeft :size="16" aria-hidden="true" />回到今晚
    </RouterLink>
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
    <section id="practice-choices" class="practice-choices" aria-labelledby="practice-title">
      <h2 id="practice-title">今晚的放松练习</h2>
      <label class="practice-state"
        >此刻的状态
        <select v-model="evening.selectedMood" @change="skipped = false">
          <option :value="null">暂不选择</option>
          <option
            v-for="mood in moods.filter(
              (item) => item.id !== 'journal' || evening.selectedMood === 'journal',
            )"
            :key="mood.id"
            :value="mood.id"
          >
            {{ mood.label }}
          </option>
        </select>
      </label>
      <div v-if="!skipped" class="recommendation-banner">
        <strong>建议试试{{ practices[guidance.practice].title }}</strong>
        <p>{{ guidance.reason }}</p>
        <p>
          {{ guidance.saved ? '你保存的声音场景' : '建议搭配' }} ·
          {{ sound }}。进入后可更换，声音由你开启。
        </p>
        <div class="practice-recommendation-actions">
          <RouterLink class="button button-secondary" :to="`/practice/${guidance.practice}`"
            >打开推荐练习</RouterLink
          >
          <button class="quiet-link" type="button" @click="skipped = true">跳过推荐</button>
        </div>
      </div>
      <ul class="practice-options">
        <li v-for="(practice, id) in practices" :key="id">
          <RouterLink class="quiet-link" :to="`/practice/${id}`">{{ practice.title }}</RouterLink>
          <span>{{ practice.description }}</span>
        </li>
      </ul>
    </section>
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
