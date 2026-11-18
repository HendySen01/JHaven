import { onMounted, onScopeDispose, ref, shallowRef } from 'vue';

export function usePracticeSpeech() {
  const voice = shallowRef<SpeechSynthesisVoice>();
  const error = ref('');
  const synth = window.speechSynthesis;
  let current: SpeechSynthesisUtterance | null = null;
  function refresh() {
    voice.value = synth
      ?.getVoices()
      .find((option) => option.localService && /^zh(?:-|$)/i.test(option.lang));
    if (!voice.value) stop();
  }
  function stop() {
    if (!current) return;
    current = null;
    synth?.cancel();
  }
  function speak(text: string) {
    stop();
    error.value = '';
    if (!synth || !voice.value || !window.SpeechSynthesisUtterance) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice.value;
    utterance.lang = voice.value.lang;
    utterance.volume = 0.35;
    utterance.rate = 0.88;
    current = utterance;
    const finish = () => {
      if (current === utterance) current = null;
    };
    utterance.onend = finish;
    const fail = () => {
      if (current === utterance) error.value = '本机语音未能播放，你仍可阅读引导。';
      finish();
    };
    utterance.onerror = fail;
    try {
      synth.speak(utterance);
    } catch {
      fail();
    }
  }
  onMounted(() => {
    refresh();
    synth?.addEventListener('voiceschanged', refresh);
  });
  onScopeDispose(() => {
    synth?.removeEventListener('voiceschanged', refresh);
    stop();
  });
  return { voice, error, speak, stop };
}
