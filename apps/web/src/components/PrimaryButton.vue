<script setup lang="ts">
import { ArrowUpRight } from '@lucide/vue';
defineProps<{ to: string }>();
</script>
<template>
  <RouterLink :to="to" class="button button-primary"
    ><slot /><ArrowUpRight :size="18" aria-hidden="true"
  /></RouterLink>
</template>
