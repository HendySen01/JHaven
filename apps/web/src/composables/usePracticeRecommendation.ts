import { computed } from 'vue';
import { recommendPractice } from '../domain/relaxation';
import { useEveningStore } from '../stores/evening';
import { useAudioEngine } from './useAudioEngine';

export function usePracticeRecommendation() {
  const audio = useAudioEngine();
  const evening = useEveningStore();
  return computed(() =>
    recommendPractice(
      evening.selectedMood,
      audio.savedAccountScene ??
        (audio.practiceAudio || audio.accountMix
          ? null
          : (audio.presets.find((preset) => preset.id === audio.currentId) ?? null)),
    ),
  );
}
