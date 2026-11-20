<script setup lang="ts">
import { nextTick, onMounted, onScopeDispose, ref, useId } from 'vue';

const props = defineProps<{ label: string; count: number }>();
const value = defineModel<number>({ required: true });
const wheel = ref<HTMLElement>();
const id = useId();
const row = 40;
let drag: { y: number; start: number; last: number; time: number; speed: number } | undefined;
let dragged = false;
let commanded = false;
let clickTimer: ReturnType<typeof setTimeout> | undefined;
const clamp = (n: number) => Math.max(0, Math.min(props.count - 1, n));
const format = (n: number) => String(n).padStart(2, '0');
function choose(n: number, animate = false) {
  commanded = true;
  value.value = clamp(n);
  const motion =
    !matchMedia('(prefers-reduced-motion: reduce)').matches &&
    document.documentElement.dataset.reduceMotion !== 'true';
  wheel.value?.scrollTo({
    top: value.value * row,
    behavior: animate && motion ? 'smooth' : 'instant',
  });
}
function sync(event: Event) {
  if (commanded) return;
  value.value = clamp(Math.round((event.currentTarget as HTMLElement).scrollTop / row));
}
function key(event: KeyboardEvent) {
  const target = {
    ArrowUp: value.value - 1,
    ArrowDown: value.value + 1,
    Home: 0,
    End: props.count - 1,
    PageUp: value.value - 5,
    PageDown: value.value + 5,
  }[event.key];
  if (target === undefined) return;
  event.preventDefault();
  choose(target);
}
function start(event: PointerEvent) {
  commanded = false;
  if (event.pointerType !== 'mouse' || event.button !== 0 || !wheel.value) return;
  dragged = false;
  wheel.value.scrollTo({ top: wheel.value.scrollTop, behavior: 'instant' });
  drag = {
    y: event.clientY,
    start: wheel.value.scrollTop,
    last: event.clientY,
    time: event.timeStamp,
    speed: 0,
  };
}
function move(event: PointerEvent) {
  if (!drag || !wheel.value || event.buttons !== 1) return;
  if (!dragged && Math.abs(drag.y - event.clientY) < 4) return;
  if (!dragged) {
    dragged = true;
    wheel.value.setPointerCapture(event.pointerId);
    wheel.value.classList.add('dragging');
  }
  drag.speed = (drag.last - event.clientY) / Math.max(12, event.timeStamp - drag.time);
  drag.time = event.timeStamp;
  drag.last = event.clientY;
  wheel.value.scrollTo({ top: drag.start + drag.y - event.clientY, behavior: 'instant' });
}
function finish(event: PointerEvent) {
  if (!drag || !wheel.value) return;
  const coast =
    event.type === 'pointerup' && event.timeStamp - drag.time < 90
      ? Math.max(-120, Math.min(120, drag.speed * 95))
      : 0;
  if (dragged) {
    const selected = Math.round((wheel.value.scrollTop + coast) / row);
    choose(selected);
    wheel.value.classList.remove('dragging');
    clickTimer = setTimeout(() => {
      dragged = false;
    }, 0);
  }
  drag = undefined;
}
onMounted(() => void nextTick(() => choose(value.value)));
onScopeDispose(() => clearTimeout(clickTimer));
</script>

<template>
  <div>
    <span :id="id + '-label'">{{ label }}</span>
    <div
      ref="wheel"
      class="time-wheel"
      role="listbox"
      tabindex="0"
      :aria-labelledby="id + '-label'"
      :aria-activedescendant="id + '-' + value"
      @scroll="sync"
      @wheel.passive="commanded = false"
      @keydown="key"
      @pointerdown="start"
      @pointermove="move"
      @pointerup="finish"
      @pointercancel="finish"
      @lostpointercapture="finish"
    >
      <div
        v-for="n in count"
        :id="id + '-' + (n - 1)"
        :key="n"
        role="option"
        :aria-selected="value === n - 1"
        @click="!dragged && choose(n - 1, true)"
      >
        {{ format(n - 1) }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.time-wheel {
  box-sizing: border-box;
  height: 160px;
  padding-block: 60px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-snap-type: y mandatory;
  scrollbar-width: none;
  border-radius: 12px;
  background: var(--page);
  user-select: none;
  font-variant-numeric: tabular-nums;
}
.time-wheel.dragging {
  scroll-snap-type: none;
  cursor: grabbing;
}
[role='option'] {
  height: 40px;
  display: grid;
  place-items: center;
  scroll-snap-align: center;
  cursor: pointer;
  color: var(--soft);
}
[aria-selected='true'] {
  background: var(--surface);
  color: var(--accent);
  font-weight: 700;
  font-size: 1.15rem;
}
@media (prefers-reduced-motion: no-preference) {
  :global(html:not([data-reduce-motion='true']) .time-wheel [role='option']) {
    transition:
      color 100ms ease,
      background-color 100ms ease,
      scale 130ms cubic-bezier(0.25, 0.7, 0.32, 1.12);
  }
  :global(html:not([data-reduce-motion='true']) .time-wheel [aria-selected='true']) {
    scale: 1.035;
  }
}
</style>
