import { computed, ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import {
  AUDIO_STORAGE_KEY,
  BUILTIN_PRESETS,
  copyMix,
  defaultAudio,
  parseSavedAudio,
  singleTrackMix,
} from '../domain/audio';
import { TRACK_IDS, type AudioMix, type SoundPreset, type TrackId } from '../types/audio';
import { AudioEngine } from '../services/audio/AudioEngine';

export const useAudioStore = defineStore('audio', () => {
  const mix = ref<AudioMix>(defaultAudio().mix);
  const masterVolume = ref(defaultAudio().masterVolume);
  const favorites = ref<TrackId[]>([]);
  const auditionId = ref<TrackId | null>(null);
  let normalTimer: { duration: number; fade: number } | null = null;
  let unmutedVolume = defaultAudio().masterVolume;
  const presets = ref<SoundPreset[]>([]);
  const currentName = ref('雨夜');
  const currentId = ref<string | null>('rain');
  const storageMessage = ref('混音与自定义场景仅存当前浏览器；刷新取消计时，不会自动播放。');
  const formMessage = ref('');
  let engine: AudioEngine | null = null;
  let unsubscribe: (() => void) | null = null;
  let initialized = false;
  const snapshot = shallowRef(new AudioEngine().snapshot());
  const selectedCount = computed(() => TRACK_IDS.filter((id) => mix.value[id].enabled).length);
  function ensureEngine() {
    if (!engine) {
      engine = new AudioEngine();
      engine.applyMix(mix.value);
      engine.setMasterVolume(masterVolume.value);
      unsubscribe = engine.subscribe((value) => {
        snapshot.value = value;
        if (auditionId.value && value.status === 'idle') {
          const timer = normalTimer;
          auditionId.value = null;
          normalTimer = null;
          engine?.applyMix(mix.value);
          if (timer) engine?.setTimer(timer.duration, timer.fade);
        }
      });
    }
    return engine;
  }
  function initialize() {
    if (initialized) return;
    initialized = true;
    try {
      const saved = parseSavedAudio(localStorage.getItem(AUDIO_STORAGE_KEY));
      mix.value = saved.mix;
      masterVolume.value = saved.masterVolume;
      presets.value = saved.presets;
      favorites.value = saved.favorites;
      identify(saved.currentPresetId);
    } catch {
      storageMessage.value = '本地声音偏好无法读取，已使用默认混音。你可以重新设置。';
    }
    ensureEngine();
  }
  function identify(preferred: string | null = null) {
    const all = [...BUILTIN_PRESETS, ...presets.value];
    const matches = (preset: SoundPreset) =>
      JSON.stringify(preset.mix) === JSON.stringify(mix.value);
    const match =
      all.find((preset) => preset.id === preferred && matches(preset)) ?? all.find(matches);
    currentName.value = match?.name ?? '自定义混音';
    currentId.value = match?.id ?? null;
  }
  function persist() {
    try {
      localStorage.setItem(
        AUDIO_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          mix: mix.value,
          masterVolume: masterVolume.value,
          presets: presets.value,
          currentPresetId: currentId.value,
          favorites: favorites.value,
        }),
      );
      storageMessage.value = '声音偏好已保存在当前浏览器，不上传；刷新取消计时，不自动播放。';
      return true;
    } catch {
      storageMessage.value = '当前混音已生效，但浏览器无法保存，刷新后可能丢失。';
      return false;
    }
  }
  function applyPreset(preset: SoundPreset) {
    if (auditionId.value) engine?.stop(0);
    mix.value = copyMix(preset.mix);
    currentName.value = preset.name;
    currentId.value = preset.id;
    ensureEngine().applyMix(mix.value);
    persist();
  }
  function applyBuiltin(id: string) {
    const preset = BUILTIN_PRESETS.find((item) => item.id === id);
    if (preset) applyPreset(preset);
  }
  function updateTrack(id: TrackId, patch: Partial<AudioMix[TrackId]>) {
    if (auditionId.value) engine?.stop(0);
    mix.value = copyMix(mix.value);
    mix.value[id] = { ...mix.value[id], ...patch };
    ensureEngine().applyMix(mix.value);
    identify();
    persist();
  }
  function setMaster(value: number) {
    ensureEngine().setMasterVolume(value);
    masterVolume.value = snapshot.value.masterVolume;
    if (masterVolume.value > 0) unmutedVolume = masterVolume.value;
    persist();
  }
  function toggleMute() {
    if (masterVolume.value > 0) unmutedVolume = masterVolume.value;
    setMaster(masterVolume.value > 0 ? 0 : unmutedVolume);
  }
  function toggleFavorite(id: TrackId) {
    favorites.value = favorites.value.includes(id)
      ? favorites.value.filter((favorite) => favorite !== id)
      : [...favorites.value, id];
    persist();
  }
  function audition(id: TrackId) {
    if (snapshot.value.status !== 'idle') return;
    const player = ensureEngine();
    normalTimer = { duration: snapshot.value.timer.duration, fade: snapshot.value.fadeSeconds };
    player.applyMix(singleTrackMix(id, 55));
    player.setTimer(12, 5);
    auditionId.value = id;
    void player.play();
  }
  function savePreset(name: string) {
    const trimmed = name.trim();
    formMessage.value = '';
    if (!trimmed || trimmed.length > 40) {
      formMessage.value = '场景名称请填写 1–40 个字符。';
      return false;
    }
    if (!selectedCount.value) {
      formMessage.value = '请至少开启一条音轨再保存。';
      return false;
    }
    if (presets.value.length >= 20) {
      formMessage.value = '最多保存 20 个场景，请先删除不用的场景。';
      return false;
    }
    if (presets.value.some((preset) => preset.name === trimmed)) {
      formMessage.value = '已有同名场景，请换一个名称。';
      return false;
    }
    const preset: SoundPreset = {
      id: `custom-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`}`,
      name: trimmed,
      mix: copyMix(mix.value),
    };
    presets.value = [...presets.value, preset];
    currentName.value = preset.name;
    currentId.value = preset.id;
    const saved = persist();
    formMessage.value = saved
      ? '场景已保存在当前浏览器。'
      : '场景仅保留在本次访问中，浏览器未能持久保存。';
    return saved;
  }
  function deletePreset(id: string) {
    presets.value = presets.value.filter((preset) => preset.id !== id);
    if (currentId.value === id) {
      currentId.value = null;
      currentName.value = '自定义混音';
    }
    persist();
    formMessage.value = '已从当前场景列表移除。';
  }
  function play() {
    return ensureEngine().play();
  }
  function pause() {
    ensureEngine().pause();
  }
  function stop() {
    ensureEngine().stop();
  }
  function setTimer(seconds: number, fade: number) {
    ensureEngine().setTimer(seconds, fade);
  }
  function pauseTimer() {
    ensureEngine().pauseTimer();
  }
  function resumeTimer() {
    ensureEngine().resumeTimer();
  }
  function resetTimer() {
    ensureEngine().resetTimer();
  }
  function tick() {
    engine?.tick();
  }
  function dispose() {
    unsubscribe?.();
    unsubscribe = null;
    const previous = engine;
    engine = null;
    auditionId.value = null;
    normalTimer = null;
    if (previous) void previous.dispose();
    const initial = new AudioEngine();
    initial.applyMix(mix.value);
    initial.setMasterVolume(masterVolume.value);
    snapshot.value = initial.snapshot();
  }
  return {
    mix,
    masterVolume,
    favorites,
    auditionId,
    presets,
    currentName,
    currentId,
    snapshot,
    selectedCount,
    storageMessage,
    formMessage,
    initialize,
    applyPreset,
    applyBuiltin,
    updateTrack,
    setMaster,
    toggleMute,
    toggleFavorite,
    audition,
    savePreset,
    deletePreset,
    play,
    pause,
    stop,
    setTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,
    tick,
    dispose,
  };
});
