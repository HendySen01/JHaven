import { defineStore } from 'pinia';
import { ref } from 'vue';
import { fetchHealth } from '../lib/health';

export const useServiceStore = defineStore('service', () => {
  const status = ref<'idle' | 'checking' | 'connected' | 'unavailable'>('idle');

  async function check() {
    if (status.value === 'checking') return;
    status.value = 'checking';
    try {
      await fetchHealth();
      status.value = 'connected';
    } catch {
      status.value = 'unavailable';
    }
  }

  return { status, check };
});
