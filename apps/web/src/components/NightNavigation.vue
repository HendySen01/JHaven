<script setup lang="ts">
import { SlidersHorizontal } from '@lucide/vue';
import JHavenLogo from './JHavenLogo.vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
const route = useRoute();
const auth = useAuthStore();
defineEmits<{ settings: [] }>();
</script>
<template>
  <header class="site-header">
    <JHavenLogo />
    <nav aria-label="主导航" class="main-nav">
      <RouterLink to="/" exact-active-class="nav-active">今晚</RouterLink>
      <RouterLink
        to="/relax"
        active-class="nav-active"
        :class="{ 'nav-active': route.path.startsWith('/relax/') }"
        :aria-current="route.path.startsWith('/relax/') ? 'location' : undefined"
        >声音场景</RouterLink
      >
      <RouterLink to="/journal" active-class="nav-active">睡眠日记</RouterLink>
      <RouterLink to="/assistant" active-class="nav-active">睡前助手</RouterLink>
      <RouterLink to="/about" active-class="nav-active">关于</RouterLink>
    </nav>
    <div class="site-header-actions">
      <RouterLink class="account-link" :to="{ name: auth.signedIn ? 'account' : 'login' }">{{
        auth.signedIn ? '我的账户' : '登录'
      }}</RouterLink>
      <button
        class="settings-trigger"
        type="button"
        aria-label="打开设置"
        aria-haspopup="dialog"
        @click="$emit('settings')"
      >
        <SlidersHorizontal :size="18" aria-hidden="true" /><span>设置</span>
      </button>
    </div>
  </header>
</template>
