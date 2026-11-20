<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from 'vue';
import { X } from '@lucide/vue';
defineProps<{ title: string; closeLabel?: string; eyebrow?: string }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
const titleId = useId();
let opener: HTMLElement | null = null;
let previousOverflow = '';
onMounted(() => {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  dialog.value?.showModal();
});
onBeforeUnmount(() => {
  dialog.value?.close();
  document.body.style.overflow = previousOverflow;
  if (opener?.isConnected) opener.focus({ preventScroll: true });
});
function closeOnBackdrop(event: MouseEvent) {
  if (event.target !== dialog.value || !dialog.value) return;
  const rect = dialog.value.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    emit('close');
}

function keepFocusInside(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !dialog.value) return;
  const controls = Array.from(
    dialog.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getClientRects().length > 0);
  const first = controls[0];
  const last = controls.at(-1);
  // 显式循环首尾，避免浏览器把焦点移到地址栏。
  if (event.shiftKey && document.activeElement === first && last) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last && first) {
    event.preventDefault();
    first.focus();
  }
}
</script>
<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="modal-panel"
      :aria-labelledby="titleId"
      @cancel.prevent="emit('close')"
      @click="closeOnBackdrop"
      @keydown="keepFocusInside"
    >
      <div class="modal-header">
        <div>
          <p v-if="eyebrow !== ''" class="eyebrow">{{ eyebrow ?? 'YOUR LITTLE PREFERENCES' }}</p>
          <h2 :id="titleId">{{ title }}</h2>
        </div>
        <button
          class="icon-button"
          type="button"
          autofocus
          :aria-label="closeLabel ?? '关闭设置'"
          @click="emit('close')"
        >
          <X :size="20" aria-hidden="true" />
        </button>
      </div>
      <slot />
    </dialog>
  </Teleport>
</template>
