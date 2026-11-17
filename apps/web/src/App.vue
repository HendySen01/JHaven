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
const audio = useAudioEngine();
const auth = useAuthStore();
audio.initialize();
onMounted(() => {
  void auth.restore();
  window.addEventListener('pagehide', audio.dispose);
  document.addEventListener('visibilitychange', audio.tick);
});
onBeforeUnmount(() => {
  window.removeEventListener('pagehide', audio.dispose);
  document.removeEventListener('visibilitychange', audio.tick);
  audio.dispose();
});
const settingsOpen = ref(false);
const settings = usePreferencesStore();
const route = useRoute();
const showPlayerDock = computed(
  () => audio.snapshot.status !== 'idle' && !/^\/relax(?:\/|$)/.test(route.path),
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
  <div class="app-shell" :class="{ 'has-player-dock': showPlayerDock }">
    <NightNavigation @settings="settingsOpen = true" />
    <main id="main-content" tabindex="-1">
      <RouterView /><AmbientPlayer
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
