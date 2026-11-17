<script setup lang="ts">
import { MoonStar } from '@lucide/vue';
</script>
<template>
  <RouterLink class="brand" to="/" aria-label="JHaven 首页">
    <span class="brand-mark"><MoonStar :size="23" :stroke-width="1.4" aria-hidden="true" /></span>
    <span>JHaven<span class="brand-dot">.</span></span>
  </RouterLink>
</template>
