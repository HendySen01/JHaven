<script setup lang="ts">
import type { SceneId } from '../domain/evening';
defineProps<{ scene: SceneId }>();
</script>
<template>
  <div class="scene-artwork" :class="`artwork-${scene}`" aria-hidden="true">
    <span class="art-moon"></span><span class="art-landscape"></span
    ><span class="art-detail"></span>
    <span class="art-frame"></span>
  </div>
</template>
