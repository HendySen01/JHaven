<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const checking = ref(true);
async function check() {
  checking.value = true;
  await auth.refreshAccount();
  checking.value = false;
  if (!auth.user) await router.replace({ name: 'login' });
}
onMounted(check);
async function logout() {
  if (await auth.submit('logout')) await router.replace({ name: 'login' });
}
</script>

<template>
  <div class="content-page auth-page">
    <h1 tabindex="-1">我的账户</h1>
    <p v-if="checking" class="page-lead" role="status">正在检查会话…</p>
    <template v-else-if="auth.user">
      <p class="page-lead">
        用户名：<strong>{{ auth.user.username }}</strong>
      </p>
      <p class="auth-hint">
        声音收藏、配比与界面偏好保存在当前浏览器，登录前后的设备偏好均可继续使用。日记和跨设备同步待开放。
      </p>
      <p v-if="auth.error" class="field-error" role="alert">{{ auth.error }}</p>
      <div class="auth-account-actions">
        <RouterLink to="/relax" class="button button-secondary">打开声音库</RouterLink>
        <button
          type="button"
          class="button button-primary"
          :disabled="auth.pending"
          @click="logout"
        >
          {{ auth.pending ? '正在退出…' : '退出登录' }}
        </button>
      </div>
    </template>
  </div>
</template>
