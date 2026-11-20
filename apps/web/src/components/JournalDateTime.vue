<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { journalDate } from '@jhaven/shared';
import { shiftDate } from '../domain/journal';
import ModalPanel from './ModalPanel.vue';
import TimeWheel from './TimeWheel.vue';

const props = defineProps<{ label: string; baseDate: string }>();
const model = defineModel<string>({ required: true });
const open = ref(false);
const day = ref('');
const month = ref('');
const hour = ref(0);
const minute = ref(0);
const calendar = ref<HTMLElement>();
const activeDate = computed(() =>
  day.value.startsWith(month.value) ? day.value : month.value + '-01',
);
const pad = (n: number) => String(n).padStart(2, '0');
const cells = computed(() => {
  const [year, number] = month.value.split('-').map(Number);
  const first = new Date(Date.UTC(year!, number! - 1, 1)).getUTCDay();
  const length = new Date(Date.UTC(year!, number!, 0)).getUTCDate();
  return Array.from({ length: 42 }, (_, index) => {
    const date = index - first + 1;
    return date < 1 || date > length ? '' : month.value + '-' + pad(date);
  });
});
function begin(event: MouseEvent) {
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
  const [saved, time = '22:00'] = model.value.split('T');
  day.value =
    saved ||
    (journalDate.safeParse(props.baseDate).success
      ? props.baseDate
      : new Date().toISOString().slice(0, 10));
  month.value = day.value.slice(0, 7);
  [hour.value, minute.value] = time.split(':').map(Number) as [number, number];
  open.value = true;
}
function moveMonth(step: number) {
  const [year, number] = month.value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, number! - 1 + step, 1)).toISOString().slice(0, 7);
  if (date >= '1900-01' && date <= '2099-12') month.value = date;
}
function moveDay(event: KeyboardEvent, date: string) {
  const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
  if (offset === undefined) return;
  event.preventDefault();
  const parsed = journalDate.safeParse(shiftDate(date, offset));
  if (!parsed.success) return;
  day.value = parsed.data;
  month.value = parsed.data.slice(0, 7);
  void nextTick(() =>
    calendar.value?.querySelector<HTMLButtonElement>(`[aria-label="${parsed.data}"]`)?.focus(),
  );
}
function apply() {
  const next = day.value + 'T' + pad(hour.value) + ':' + pad(minute.value);
  if (!model.value.startsWith(next)) model.value = next;
  open.value = false;
}
function clear() {
  model.value = '';
  open.value = false;
}
</script>

<template>
  <div class="diary-picker">
    <span>{{ label }}</span>
    <button
      class="button button-secondary"
      type="button"
      aria-haspopup="dialog"
      :aria-label="label + '：' + (model ? model.replace('T', ' ') : '未设置')"
      @click="begin"
    >
      {{ model ? model.replace('T', ' ').slice(0, 16) : '选择日期和时间' }}
    </button>
    <ModalPanel
      v-if="open"
      :title="label"
      close-label="关闭日期时间选择器"
      eyebrow=""
      @close="open = false"
    >
      <div class="picker-month">
        <button
          class="quiet-link"
          type="button"
          aria-label="上个月"
          :disabled="month === '1900-01'"
          @click="moveMonth(-1)"
        >
          ‹
        </button>
        <strong aria-live="polite">{{ month }}</strong>
        <button
          class="quiet-link"
          type="button"
          aria-label="下个月"
          :disabled="month === '2099-12'"
          @click="moveMonth(1)"
        >
          ›
        </button>
      </div>
      <div ref="calendar" class="picker-calendar" role="group" aria-label="日期">
        <span
          v-for="weekday in ['日', '一', '二', '三', '四', '五', '六']"
          :key="weekday"
          aria-hidden="true"
          >{{ weekday }}</span
        >
        <template v-for="(date, index) in cells" :key="index">
          <button
            v-if="date"
            class="picker-day"
            type="button"
            :aria-label="date"
            :aria-pressed="date === day"
            :tabindex="date === activeDate ? 0 : -1"
            @click="day = date"
            @keydown="moveDay($event, date)"
          >
            {{ Number(date.slice(-2)) }}
          </button>
          <span v-else aria-hidden="true" />
        </template>
      </div>
      <div class="picker-wheels">
        <TimeWheel v-model="hour" label="小时" :count="24" />
        <TimeWheel v-model="minute" label="分钟" :count="60" />
      </div>
      <div class="space-actions">
        <button class="button button-primary" type="button" @click="apply">应用日期和时间</button>
        <button v-if="model" class="quiet-link" type="button" @click="clear">清除</button>
      </div>
    </ModalPanel>
  </div>
</template>

<style scoped>
.diary-picker {
  display: grid;
  gap: 6px;
  color: var(--soft);
  font-size: 14px;
}
.diary-picker > button {
  justify-content: flex-start;
}
.picker-month {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.picker-month button {
  min-height: 44px;
  min-width: 44px;
  justify-content: center;
}
.picker-calendar {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 2px;
  text-align: center;
}
.picker-day {
  min-height: 40px;
  border-radius: 8px;
  background: var(--surface);
}
.picker-day[aria-pressed='true'] {
  background: var(--accent);
  color: var(--page);
}
.picker-wheels {
  margin-block: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  text-align: center;
}
</style>
