<script setup lang="ts">
import { ArrowLeft, MoonStar } from '@lucide/vue';
</script>

<template>
  <div class="not-found content-page">
    <MoonStar :size="42" :stroke-width="1" aria-hidden="true" />
    <p class="eyebrow">404 · A LITTLE DETOUR</p>
    <h1 tabindex="-1">这条小路，暂时没有灯。</h1>
    <p class="page-lead">你访问的页面不存在。港湾还在这里。</p>
    <RouterLink class="button button-primary" to="/"
      ><ArrowLeft :size="16" aria-hidden="true" />回到首页</RouterLink
    >
  </div>
</template>
