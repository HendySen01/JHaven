import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  DEFAULT_PREFERENCES,
  readPreferences,
  savePreferences,
  type Preferences,
} from '../domain/preferences';

export const usePreferencesStore = defineStore('preferences', () => {
  const preferences = ref<Preferences>({ ...DEFAULT_PREFERENCES });
  const storageMessage = ref('界面偏好仅保存在当前浏览器，不含今晚状态或日记。');
  const storageFailed = ref(false);

  function initialize() {
    try {
      const result = readPreferences(window.localStorage);
      preferences.value = result.preferences;
      storageFailed.value = result.error;
    } catch {
      storageFailed.value = true;
    }
    if (storageFailed.value)
      storageMessage.value = '无法读取本地偏好，已使用默认设置。你仍可在本次访问中调整。';
  }

  function update(patch: Partial<Omit<Preferences, 'version'>>) {
    preferences.value = { ...preferences.value, ...patch };
    let saved = false;
    try {
      saved = savePreferences(window.localStorage, preferences.value);
    } catch {
      /* 浏览器可能禁止访问 localStorage。 */
    }
    storageFailed.value = !saved;
    storageMessage.value = saved
      ? '界面偏好已保存在当前浏览器，不会上传。'
      : '本次调整已生效，但浏览器无法保存偏好，刷新后可能丢失。';
  }

  function reset() {
    update({ ...DEFAULT_PREFERENCES });
  }
  return { preferences, storageMessage, storageFailed, initialize, update, reset };
});
