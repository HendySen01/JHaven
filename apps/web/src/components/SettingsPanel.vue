<script setup lang="ts">
import ModalPanel from './ModalPanel.vue';
import { usePreferencesStore } from '../stores/preferences';
const settings = usePreferencesStore();
defineEmits<{ close: [] }>();
</script>
<template>
  <ModalPanel remember-scroll title="让这里，更像你的夜晚" @close="$emit('close')">
    <p class="settings-intro">夜景、配色和动效，都可以按你的习惯来。</p>
    <fieldset class="palette-options">
      <legend>夜晚配色</legend>
      <label
        v-for="palette in ['night', 'moonlight'] as const"
        :key="palette"
        class="palette-option"
        :class="{ 'is-selected': settings.preferences.palette === palette }"
      >
        <input
          type="radio"
          name="palette"
          :value="palette"
          :checked="settings.preferences.palette === palette"
          @change="settings.update({ palette })"
        />
        <span class="palette-swatch" :class="palette" aria-hidden="true"></span>
        {{ palette === 'night' ? '深夜蓝' : '月光紫' }}
      </label>
    </fieldset>
    <label class="setting-row">
      <span
        ><strong>减少动画</strong><small>减少界面过渡。也会尊重设备的减少动效设置。</small></span
      >
      <input
        type="checkbox"
        role="switch"
        aria-label="减少动画"
        :checked="settings.preferences.reduceMotion"
        @change="settings.update({ reduceMotion: !settings.preferences.reduceMotion })"
      />
    </label>
    <label class="setting-row">
      <span><strong>显示夜景</strong><small>保留月亮与场景插画，或享受更简洁的界面。</small></span>
      <input
        type="checkbox"
        role="switch"
        aria-label="显示夜景"
        :checked="settings.preferences.showLandscape"
        @change="settings.update({ showLandscape: !settings.preferences.showLandscape })"
      />
    </label>
    <div class="settings-storage" :class="{ 'storage-warning': settings.storageFailed }">
      <p role="status">{{ settings.storageMessage }}</p>
      <p>这些偏好只留在当前浏览器，和账户里的日记分开。</p>
    </div>
    <div class="settings-actions">
      <button type="button" class="quiet-link reset-button" @click="settings.reset">恢复默认</button
      ><button type="button" class="button button-primary" @click="$emit('close')">完成设置</button>
    </div>
  </ModalPanel>
</template>
