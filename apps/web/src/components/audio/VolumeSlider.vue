<script setup lang="ts">
defineProps<{ label: string; value: number; disabled?: boolean }>();
const emit = defineEmits<{ change: [value: number] }>();
function update(event: Event) {
  emit('change', Number((event.target as HTMLInputElement).value));
}
</script>
<template>
  <label class="volume-control"
    ><span>{{ label }}</span
    ><input
      type="range"
      min="0"
      max="100"
      step="1"
      :value="value"
      :disabled="disabled"
      :aria-label="label"
      :aria-valuetext="`${value}%`"
      @input="update"
    /><output>{{ value }}%</output></label
  >
</template>
