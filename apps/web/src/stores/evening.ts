import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { recommendForMood, type MoodId, type SceneId } from '../domain/evening';

export const useEveningStore = defineStore('evening', () => {
  // 今晚状态与场景仅存内存，不持久化，也不发送到服务器。
  const selectedMood = ref<MoodId | null>(null);
  const selectedScene = ref<SceneId | null>(null);
  const recommendation = computed(() => recommendForMood(selectedMood.value));
  return { selectedMood, selectedScene, recommendation };
});
