<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import { APP_INFO } from '@jhaven/shared';
import NightNavigation from './components/NightNavigation.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import { usePreferencesStore } from './stores/preferences';
import { useAudioEngine } from './composables/useAudioEngine';
import AmbientPlayer from './components/audio/AmbientPlayer.vue';
import PlayerDock from './components/audio/PlayerDock.vue';
import { useAuthStore } from './stores/auth';
import { personalSpace } from '@jhaven/shared';
import { spaceRequest } from './lib/space';
import { BUILTIN_PRESETS } from './domain/audio';
const audio = useAudioEngine();
const auth = useAuthStore();
const route = useRoute();
audio.initialize();
watch(
  () => auth.user?.id,
  (id, _previous, cleanup) => {
    audio.endPracticeAudio();
    audio.clearAccountMix();
    audio.savedAccountScene = null;
    if (!id) return;
    const controller = new AbortController();
    cleanup(() => controller.abort());
    void spaceRequest(id, '', 'GET', undefined, controller.signal)
      .then((value) => {
        if (controller.signal.aborted || auth.user?.id !== id || audio.accountMix) return;
        const data = personalSpace.parse(value);
        const preference = data.preferences;
        if (!preference) return;
        const scenes = preference.scene?.kind === 'preset' ? data.presets : BUILTIN_PRESETS;
        const scene = scenes.find((p) => p.id === preference.scene?.id) ?? null;
        audio.savedAccountScene = scene;
        if (audio.snapshot.status === 'idle' && !audio.practiceAudio && !route.meta.practice)
          audio.applyAccountMix(scene, preference.volume, preference.timerMinutes);
      })
      .catch(() => undefined);
  },
  { flush: 'sync' },
);
function refreshVisibleAccount() {
  if (document.visibilityState === 'visible' && auth.user && !auth.pending)
    void auth.refreshAccount();
}
onMounted(() => {
  void auth.restore();
  window.addEventListener('pagehide', audio.dispose);
  document.addEventListener('visibilitychange', audio.tick);
  document.addEventListener('visibilitychange', refreshVisibleAccount);
});
onBeforeUnmount(() => {
  window.removeEventListener('pagehide', audio.dispose);
  document.removeEventListener('visibilitychange', audio.tick);
  document.removeEventListener('visibilitychange', refreshVisibleAccount);
  audio.dispose();
});
const settingsOpen = ref(false);
const settings = usePreferencesStore();
const showPlayerDock = computed(
  () =>
    !route.meta.practice &&
    audio.snapshot.status !== 'idle' &&
    !/^\/relax(?:\/|$)/.test(route.path),
);
settings.initialize();
watchEffect(() => {
  document.documentElement.dataset.palette = settings.preferences.palette;
  document.documentElement.dataset.reduceMotion = String(settings.preferences.reduceMotion);
  document.documentElement.dataset.landscape = String(settings.preferences.showLandscape);
});
watch(
  () => route.fullPath,
  () => {
    settingsOpen.value = false;
  },
);
</script>
<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <div
    class="app-shell"
    :class="{ 'has-player-dock': showPlayerDock, 'practice-shell': route.meta.practice }"
  >
    <NightNavigation @settings="settingsOpen = true" />
    <main id="main-content" tabindex="-1">
      <RouterView :key="route.meta.practice ? route.path : 'standard'" /><AmbientPlayer
        v-if="route.path === '/relax' || route.path.startsWith('/relax/')"
      />
    </main>
    <footer class="site-footer">
      <p>{{ APP_INFO.tagline }}</p>
      <p>不必追赶睡眠，只为休息留一点空间。</p>
      <div class="footer-meta">
        <span>JHaven · {{ APP_INFO.version }} · 环境音 Alpha</span
        ><RouterLink to="/about#boundaries">使用边界与隐私</RouterLink>
      </div>
    </footer>
  </div>
  <SettingsPanel v-if="settingsOpen" @close="settingsOpen = false" />
  <PlayerDock v-if="showPlayerDock" />
</template>
