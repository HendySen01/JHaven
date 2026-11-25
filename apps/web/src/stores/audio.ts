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
import {
  AUDIO_RECOVERY_KEY,
  parseAudioRecovery,
  recoveryRemaining,
  sameAudioRecovery,
  type AudioRecovery,
} from '../domain/audioRecovery';
import {
  TRACK_IDS,
  type AudioMix,
  type AudioSnapshot,
  type SoundPreset,
  type TrackId,
} from '../types/audio';
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
  const storageMessage = ref('混音与自定义场景仅存当前浏览器；上次混音可手动恢复，不会自动播放。');
  const accountMix = ref(false);
  const accountTimerRevision = ref(0);
  const savedAccountScene = shallowRef<SoundPreset | null>(null);
  const practiceAudio = ref(false);
  let practicePrevious: {
    preset: SoundPreset;
    volume: number;
    unmuted: number;
    timer: number;
    fade: number;
    previousId: string | null;
  } | null = null;
  let deviceMix: { mix: AudioMix; volume: number; id: string | null; name: string } | null = null;
  const formMessage = ref('');
  let engine: AudioEngine | null = null;
  let unsubscribe: (() => void) | null = null;
  let initialized = false;
  const snapshot = shallowRef(new AudioEngine().snapshot());
  const pendingRecovery = shallowRef<AudioRecovery | null>(null);
  let lastRecovery: AudioRecovery | null = null;
  let explicitPause = false;
  function readRecovery() {
    try {
      const saved = parseAudioRecovery(localStorage.getItem(AUDIO_RECOVERY_KEY));
      if (!saved) localStorage.removeItem(AUDIO_RECOVERY_KEY);
      return saved;
    } catch {
      return null;
    }
  }
  function clearRecovery() {
    pendingRecovery.value = null;
    lastRecovery = null;
    try {
      localStorage.removeItem(AUDIO_RECOVERY_KEY);
    } catch {
      // 禁用存储不影响播放。
    }
  }
  function captureRecovery(value: AudioSnapshot, paused = false) {
    if (accountMix.value || practiceAudio.value || auditionId.value) return;
    if (!TRACK_IDS.some((id) => mix.value[id].enabled)) return;
    const now = Date.now();
    const timer = value.timer;
    if (timer.duration && timer.remaining <= 0) {
      clearRecovery();
      return;
    }
    // 正常播放计时保存绝对截止；用户主动暂停则冻结剩余时间。
    // 系统挂起导致的 paused 不把原截止时间延长。
    const deadline = timer.running
      ? now + timer.remaining * 1000
      : !paused && lastRecovery?.duration === timer.duration
        ? lastRecovery.deadline
        : null;
    const session: AudioRecovery = {
      version: 1,
      savedAt: now,
      mix: copyMix(mix.value),
      masterVolume: value.masterVolume,
      duration: timer.duration,
      remaining: timer.remaining,
      deadline,
      fade: value.fadeSeconds,
      timerPaused: timer.duration > 0 && Boolean(engine?.isTimerManuallyPaused()),
    };
    if (session.timerPaused) session.deadline = null;
    pendingRecovery.value = null;
    if (lastRecovery && sameAudioRecovery(lastRecovery, session)) return;
    lastRecovery = session;
    try {
      localStorage.setItem(AUDIO_RECOVERY_KEY, JSON.stringify(session));
    } catch {
      // 本次播放仍正常；不承诺浏览器一定保存会话。
    }
  }
  function dismissRecovery() {
    if (!pendingRecovery.value) return;
    clearRecovery();
    if (snapshot.value.status === 'idle' || snapshot.value.status === 'error')
      ensureEngine().setTimer(0, snapshot.value.fadeSeconds);
  }
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
          return;
        }
        if (value.status === 'playing') captureRecovery(value);
        else if (value.status === 'paused' && lastRecovery) captureRecovery(value, explicitPause);
        else if (value.status === 'idle' && lastRecovery) clearRecovery();
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
    pendingRecovery.value = readRecovery();
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
          mix: deviceMix?.mix ?? practicePrevious?.preset.mix ?? mix.value,
          masterVolume: deviceMix?.volume ?? practicePrevious?.volume ?? masterVolume.value,
          presets: presets.value,
          currentPresetId: deviceMix
            ? deviceMix.id
            : practicePrevious
              ? practicePrevious.previousId
              : currentId.value,
          favorites: favorites.value,
        }),
      );
      storageMessage.value = '声音偏好已保存在当前浏览器，不上传；上次混音可手动恢复，不自动播放。';
      return true;
    } catch {
      storageMessage.value = '当前混音已生效，但浏览器无法保存，刷新后可能丢失。';
      return false;
    }
  }
  function applyPreset(preset: SoundPreset) {
    clearAccountMix();
    setMix(preset);
    persist();
  }
  function setMix(preset: SoundPreset) {
    dismissRecovery();
    if (auditionId.value) engine?.stop(0);
    mix.value = copyMix(preset.mix);
    currentName.value = preset.name;
    currentId.value = preset.id;
    ensureEngine().applyMix(mix.value);
  }
  function applyAccountMix(preset: SoundPreset | null, volume?: number, timerMinutes?: number) {
    if (!deviceMix)
      deviceMix = {
        mix: copyMix(mix.value),
        volume: masterVolume.value,
        id: currentId.value,
        name: currentName.value,
      };
    dismissRecovery();
    clearRecovery();
    accountMix.value = true;
    if (preset) setMix(preset);
    if (volume !== undefined) setMaster(volume);
    if (timerMinutes !== undefined) {
      setTimer(timerMinutes * 60, 15);
      accountTimerRevision.value++;
    }
  }
  function clearAccountMix() {
    if (!deviceMix) return;
    const saved = deviceMix;
    deviceMix = null;
    accountMix.value = false;
    ensureEngine().stop(0);
    mix.value = saved.mix;
    currentName.value = saved.name;
    currentId.value = saved.id;
    masterVolume.value = saved.volume;
    unmutedVolume = saved.volume || defaultAudio().masterVolume;
    ensureEngine().applyMix(saved.mix);
    ensureEngine().setMasterVolume(saved.volume);
    accountTimerRevision.value++;
    formMessage.value = '';
  }
  function beginPracticeAudio() {
    if (practicePrevious) return true;
    if (snapshot.value.status !== 'idle') return false;
    practicePrevious = {
      preset: { id: currentId.value ?? '', name: currentName.value, mix: copyMix(mix.value) },
      previousId: currentId.value,
      volume: masterVolume.value,
      unmuted: unmutedVolume,
      timer: snapshot.value.timer.duration,
      fade: snapshot.value.fadeSeconds,
    };
    clearRecovery();
    practiceAudio.value = true;
    return true;
  }
  function setPracticeScene(preset: SoundPreset) {
    if (beginPracticeAudio()) setMix(preset);
  }
  function endPracticeAudio() {
    const previous = practicePrevious;
    if (!previous) return;
    const player = ensureEngine();
    player.stop(0);
    setMix(previous.preset);
    currentId.value = previous.previousId;
    masterVolume.value = previous.volume;
    unmutedVolume = previous.unmuted;
    player.setMasterVolume(previous.volume);
    player.setTimer(previous.timer, previous.fade);
    practicePrevious = null;
    practiceAudio.value = false;
  }
  function applyBuiltin(id: string) {
    const preset = BUILTIN_PRESETS.find((item) => item.id === id);
    if (preset) applyPreset(preset);
  }
  function updateTrack(id: TrackId, patch: Partial<AudioMix[TrackId]>) {
    dismissRecovery();
    const adjustingAudition = auditionId.value === id && patch.enabled === undefined;
    if (auditionId.value && !adjustingAudition) engine?.stop(0);
    mix.value = copyMix(mix.value);
    mix.value[id] = { ...mix.value[id], ...patch };
    ensureEngine().applyMix(
      adjustingAudition ? singleTrackMix(id, mix.value[id].volume) : mix.value,
    );
    identify();
    if (!accountMix.value && !practiceAudio.value) persist();
  }
  function setMaster(value: number) {
    dismissRecovery();
    ensureEngine().setMasterVolume(value);
    masterVolume.value = snapshot.value.masterVolume;
    if (masterVolume.value > 0) unmutedVolume = masterVolume.value;
    if (!accountMix.value && !practiceAudio.value) persist();
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
    clearRecovery();
    const player = ensureEngine();
    normalTimer = { duration: snapshot.value.timer.duration, fade: snapshot.value.fadeSeconds };
    player.applyMix(singleTrackMix(id, mix.value[id].volume));
    player.setTimer(12, 5);
    auditionId.value = id;
    void player.play();
  }
  function savePreset(name: string) {
    const trimmed = name.trim();
    formMessage.value = '';
    if (accountMix.value) {
      formMessage.value = '可在个人账户将此混音存为账户场景。';
      return false;
    }
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
    if (pendingRecovery.value) return resumeSavedSession() ?? Promise.resolve();
    const player = ensureEngine();
    if (
      snapshot.value.status === 'paused' &&
      !explicitPause &&
      lastRecovery &&
      lastRecovery.deadline !== null
    ) {
      const remaining = recoveryRemaining(lastRecovery);
      if (remaining <= 0) {
        stop();
        storageMessage.value = '上次定时已结束，声音未恢复。';
        return Promise.resolve();
      }
      const saved = lastRecovery;
      player.restoreTimer(saved.duration, remaining, saved.fade, saved.timerPaused, saved.deadline);
    }
    explicitPause = false;
    return player.play();
  }
  function resumeSavedSession() {
    const saved = pendingRecovery.value;
    if (!saved || accountMix.value || practiceAudio.value || auditionId.value) return;
    if (snapshot.value.status !== 'idle' && snapshot.value.status !== 'error') return;
    const current = parseAudioRecovery(JSON.stringify(saved));
    if (!current) {
      dismissRecovery();
      storageMessage.value = '上次播放会话已过期，可以重新选择声音。';
      return;
    }
    explicitPause = false;
    const player = ensureEngine();
    mix.value = copyMix(current.mix);
    masterVolume.value = current.masterVolume;
    unmutedVolume = current.masterVolume || defaultAudio().masterVolume;
    identify();
    player.applyMix(mix.value);
    player.setMasterVolume(masterVolume.value);
    player.restoreTimer(
      current.duration,
      recoveryRemaining(current),
      current.fade,
      current.timerPaused,
      current.deadline,
    );
    accountTimerRevision.value++;
    persist();
    // 不 await，保留 Safari 的用户点击手势。
    return player.play().then(() => {
      if (snapshot.value.status === 'idle' && pendingRecovery.value === saved) clearRecovery();
    });
  }
  function pause() {
    explicitPause = true;
    ensureEngine().pause();
    if (lastRecovery) captureRecovery(snapshot.value, true);
  }
  function stop() {
    clearRecovery();
    ensureEngine().stop();
  }
  function setTimer(seconds: number, fade: number) {
    dismissRecovery();
    if (snapshot.value.status === 'paused') explicitPause = true;
    ensureEngine().setTimer(seconds, fade);
  }
  function pauseTimer() {
    ensureEngine().pauseTimer();
  }
  function resumeTimer() {
    ensureEngine().resumeTimer();
  }
  function resetTimer() {
    if (snapshot.value.status === 'paused') explicitPause = true;
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
    lastRecovery = null;
    explicitPause = false;
    pendingRecovery.value = accountMix.value || practiceAudio.value ? null : readRecovery();
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
    pendingRecovery,
    resumeSavedSession,
    dismissRecovery,
    selectedCount,
    storageMessage,
    formMessage,
    initialize,
    applyPreset,
    accountMix,
    accountTimerRevision,
    savedAccountScene,
    practiceAudio,
    beginPracticeAudio,
    setPracticeScene,
    endPracticeAudio,
    applyAccountMix,
    clearAccountMix,
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
