<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RefreshCw, CircleCheck, CircleHelp } from '@lucide/vue';
import { useServiceStore } from '../stores/service';

const service = useServiceStore();
const labels = {
  idle: '尚未检查',
  checking: '正在检查连接…',
  connected: '基础服务连接正常',
  unavailable: '暂时无法连接基础服务，请稍后重试。',
};
const label = computed(() => labels[service.status]);
onMounted(() => void service.check());
</script>

<template>
  <div class="service-panel">
    <div>
      <p class="eyebrow">连接状态</p>
      <p role="status" class="service-label">
        <CircleCheck v-if="service.status === 'connected'" :size="18" aria-hidden="true" />
        <CircleHelp v-else :size="18" aria-hidden="true" />
        {{ label }}
      </p>
      <p class="text-muted text-sm mt-2">
        此检查仅确认服务响应。环境音可在浏览器播放，私人记录需要账户与数据库。
      </p>
    </div>
    <button
      class="button button-secondary"
      :disabled="service.status === 'checking'"
      @click="service.check"
    >
      <RefreshCw :size="16" aria-hidden="true" />
      重新检查
    </button>
  </div>
</template>
