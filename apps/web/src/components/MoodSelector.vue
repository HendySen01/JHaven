<script setup lang="ts">
import { AudioLines, BookOpen, Cloud, Moon } from '@lucide/vue';
import { moods } from '../domain/evening';
import { useEveningStore } from '../stores/evening';
const evening = useEveningStore();
const icons = { audio: AudioLines, book: BookOpen, cloud: Cloud, moon: Moon };
</script>
<template>
  <section class="mood-section" aria-labelledby="mood-title">
    <fieldset>
      <legend id="mood-title">此刻，你更想<span class="text-muted">……</span></legend>
      <div class="mood-options">
        <label
          v-for="mood in moods"
          :key="mood.id"
          class="mood-option"
          :class="{ 'is-selected': evening.selectedMood === mood.id }"
        >
          <input v-model="evening.selectedMood" type="radio" name="tonight-mood" :value="mood.id" />
          <component :is="icons[mood.icon]" :size="17" :stroke-width="1.5" aria-hidden="true" />
          <span>{{ mood.label }}</span><span class="radio-dot" aria-hidden="true"></span>
        </label>
      </div>
    </fieldset>
    <div class="mood-recommendation" role="status" aria-live="polite" aria-atomic="true">
      <template v-if="evening.recommendation">
        <div>
          <strong>{{ evening.recommendation.title }}</strong>
          <p>{{ evening.recommendation.text }}</p>
        </div>
        <RouterLink class="quiet-link" :to="evening.recommendation.to"
          >{{ evening.recommendation.action }}<span aria-hidden="true">↗</span></RouterLink
        >
      </template>
      <p v-else>选一个此刻的心情，或直接看看喜欢的场景。这里没有正确答案。</p>
    </div>
  </section>
</template>
