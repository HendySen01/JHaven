<script setup lang="ts">
import { computed, ref } from 'vue';
import type { JournalEntry } from '@jhaven/shared';
import { dayDistance, journalClock, journalHour, shiftDate, sleepMinutes } from '../domain/journal';

const props = defineProps<{
  entries: JournalEntry[];
  from: string;
  to: string;
  loading: boolean;
  period: number;
}>();
const labels = ['很差', '较差', '一般', '较好', '很好'];
const fields = [
  { key: 'bedtime', name: '上床' },
  { key: 'asleep', name: '估计入睡' },
  { key: 'wake', name: '醒来' },
] as const;
const selected = ref('');
const hovered = ref('');
function chooseDate(date: string) {
  selected.value = date;
  hovered.value = '';
}
const rows = computed(() =>
  [...props.entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => ({
      entry,
      hours: fields.map(({ key }) => journalHour(entry.date, entry[key], entry.timezone)),
      duration: sleepMinutes(entry.asleep, entry.wake),
    })),
);
const byDate = computed(() => new Map(rows.value.map((row) => [row.entry.date, row])));
const dates = computed(() =>
  Array.from({ length: dayDistance(props.from, props.to) + 1 }, (_, i) => shiftDate(props.from, i)),
);
const detail = computed(
  () => byDate.value.get(hovered.value) ?? byDate.value.get(selected.value) ?? rows.value.at(-1),
);
const activeDate = computed(() =>
  byDate.value.has(selected.value) ? selected.value : rows.value.at(-1)?.entry.date,
);
const scale = computed(() => {
  const hours = rows.value.flatMap((row) =>
    row.hours.filter((hour): hour is number => hour !== null),
  );
  if (!hours.length) return { start: 18, end: 30 };
  const start = Math.floor(Math.min(...hours) / 3) * 3;
  return { start, end: Math.max(start + 6, Math.ceil(Math.max(...hours) / 3) * 3) };
});
const ticks = computed(() => {
  const { start, end } = scale.value;
  const step = Math.ceil((end - start) / 12) * 3;
  const positions = Array.from(
    { length: Math.floor((end - start) / step) + 1 },
    (_, i) => start + i * step,
  );
  const last = positions.at(-1)!;
  if (last !== end) {
    if (positions.length > 1 && end - last < step * 0.6) positions.pop();
    positions.push(end);
  }
  return positions;
});
const point = (hour: number) =>
  5 + ((hour - scale.value.start) / (scale.value.end - scale.value.start)) * 290;
const clock = (hour: number) => {
  const day = Math.floor(hour / 24);
  const prefix =
    day === 0
      ? ''
      : day === 1
        ? '次日 '
        : day === -1
          ? '前日 '
          : (day > 0 ? '+' : '') + day + '日 ';
  return prefix + String(((hour % 24) + 24) % 24).padStart(2, '0') + ':00';
};
const shortDate = (date: string) => date.slice(5).replace('-', '/');
const duration = (minutes: number | null) =>
  minutes === null
    ? '时长未记录'
    : minutes < 60
      ? minutes + ' 分'
      : Math.floor(minutes / 60) + ' 小时 ' + (minutes % 60) + ' 分';
const rest = (entry: JournalEntry) => (entry.rest === null ? '未记录' : labels[entry.rest - 1]);
const dayLabel = (entry: JournalEntry) => entry.date + '，查看睡眠记录';
</script>

<template>
  <div class="journal-trend" :aria-busy="loading">
    <div class="trend-visual">
      <template v-if="rows.length && period === 7">
        <div class="trend-axis" aria-hidden="true">
          <span></span>
          <div class="trend-axis-labels">
            <span
              v-for="(tick, i) in ticks"
              :key="tick"
              :style="{ left: point(tick) / 3 + '%' }"
              :class="{ 'tick-start': i === 0, 'tick-end': i === ticks.length - 1 }"
              >{{ clock(tick) }}</span
            >
          </div>
        </div>
        <div class="trend-rows" @pointerleave="hovered = ''">
          <button
            v-for="row in rows"
            :key="row.entry.id"
            type="button"
            class="trend-row"
            :aria-label="dayLabel(row.entry)"
            :aria-pressed="activeDate === row.entry.date"
            @pointerenter="hovered = row.entry.date"
            @focus="chooseDate(row.entry.date)"
            @click="chooseDate(row.entry.date)"
          >
            <span>{{ shortDate(row.entry.date) }}</span>
            <svg viewBox="0 0 300 22" preserveAspectRatio="none" aria-hidden="true">
              <line x1="5" x2="295" y1="11" y2="11" class="trend-baseline" />
              <line
                v-if="row.hours[0] != null && row.hours[1] != null && row.hours[1] >= row.hours[0]"
                :x1="point(row.hours[0])"
                :x2="point(row.hours[1])"
                y1="11"
                y2="11"
                class="trend-awake"
              />
              <line
                v-if="row.hours[1] != null && row.hours[2] != null && row.hours[2] >= row.hours[1]"
                :x1="point(row.hours[1])"
                :x2="point(row.hours[2])"
                y1="11"
                y2="11"
                class="trend-sleep"
              />
              <g
                v-for="(hour, i) in row.hours"
                :key="i"
                :transform="hour === null ? undefined : 'translate(' + point(hour) + ',11)'"
              >
                <rect
                  v-if="hour !== null && i === 0"
                  x="-3"
                  y="-4"
                  width="6"
                  height="8"
                  class="trend-marker"
                />
                <circle v-if="hour !== null && i === 1" r="4" class="trend-marker" />
                <path
                  v-if="hour !== null && i === 2"
                  d="M -4 0 L 0 -5 L 4 0 L 0 5 Z"
                  class="trend-marker"
                />
              </g>
            </svg>
            <span>{{ duration(row.duration) }}</span>
          </button>
        </div>
        <p class="trend-key">□ 上床 · ○ 估计入睡 · ◇ 醒来 · 实线为估计睡眠</p>
      </template>
      <div
        v-else-if="rows.length"
        class="trend-calendar"
        aria-label="日期概览"
        @pointerleave="hovered = ''"
      >
        <template v-for="date in dates" :key="date">
          <button
            v-if="byDate.has(date)"
            type="button"
            :aria-label="dayLabel(byDate.get(date)!.entry)"
            :aria-pressed="activeDate === date"
            @pointerenter="hovered = date"
            @focus="chooseDate(date)"
            @click="chooseDate(date)"
          >
            <span>{{ shortDate(date) }}</span>
            <small>{{ rest(byDate.get(date)!.entry) }}</small>
            <span v-if="byDate.get(date)!.duration !== null" class="trend-mini" aria-hidden="true">
              <span :style="{ width: Math.min(100, byDate.get(date)!.duration! / 14.4) + '%' }" />
            </span>
          </button>
          <span v-else class="trend-missing"
            >{{ shortDate(date) }}<span class="sr-only">无记录</span></span
          >
        </template>
      </div>
      <p v-else class="auth-hint trend-empty">
        {{ loading ? '正在读取记录…' : '这段时间没有日记。' }}
      </p>
      <p v-if="rows.length && period === 30" class="trend-key">
        方格里的短条按 24 小时比例显示估计时长
      </p>
    </div>
    <div class="trend-detail" role="region" aria-label="当日睡眠详情" aria-live="polite">
      <template v-if="detail">
        <div class="trend-detail-heading">
          <strong>{{ detail.entry.date }}</strong>
          <span class="auth-hint">{{ detail.entry.timezone }}</span>
        </div>
        <dl class="diary-times">
          <div v-for="field in fields" :key="field.key">
            <dt>{{ field.name }}</dt>
            <dd>
              {{ journalClock(detail.entry.date, detail.entry[field.key], detail.entry.timezone) }}
            </dd>
          </div>
          <div>
            <dt>估计睡了</dt>
            <dd>{{ duration(detail.duration) }}</dd>
          </div>
          <div>
            <dt>醒来感觉</dt>
            <dd class="trend-rest">{{ rest(detail.entry) }}</dd>
          </div>
        </dl>
      </template>
    </div>
  </div>
</template>

<style scoped>
.journal-trend {
  min-block-size: 24.1rem;
  align-content: start;
}
.trend-visual {
  min-block-size: 3rem;
  max-block-size: 14.5rem;
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0;
}
.trend-rows {
  overflow-y: auto;
  min-height: 0;
}
.trend-row,
.trend-axis {
  display: grid;
  grid-template-columns: 2.6rem minmax(0, 1fr) 6.3rem;
  align-items: center;
  gap: 0.35rem;
}
.trend-row {
  width: 100%;
  min-height: 44px;
  padding: 0.25rem 0.45rem;
  color: inherit;
  text-align: start;
  border-radius: 0.6rem;
  font-size: 0.8rem;
}
.trend-axis {
  padding-inline: 0.45rem;
}
.trend-row svg {
  display: block;
  width: 100%;
  height: 22px;
  overflow: visible;
}
.trend-axis-labels {
  position: relative;
  min-height: 22px;
  font-size: 0.65rem;
  color: var(--muted);
}
.trend-axis-labels span {
  position: absolute;
  white-space: nowrap;
  transform: translateX(-50%);
}
.trend-axis-labels .tick-start {
  transform: none;
}
.trend-axis-labels .tick-end {
  transform: translateX(-100%);
}
@media (max-width: 540px) {
  .trend-axis-labels span:not(.tick-start, .tick-end) {
    display: none;
  }
}
.trend-baseline {
  stroke: currentColor;
  opacity: 0.18;
}
.trend-awake {
  stroke: currentColor;
  stroke-width: 3px;
  stroke-dasharray: 3 3;
  opacity: 0.7;
}
.trend-sleep {
  stroke: var(--accent, #c7b1f3);
  stroke-width: 5px;
  stroke-linecap: round;
}
.trend-marker {
  fill: var(--night-bg, #181525);
  stroke: var(--accent, #c7b1f3);
  stroke-width: 1.4px;
}
.trend-key {
  margin: 0.3rem 0.45rem 0;
  font-size: 0.75rem;
}
.trend-calendar {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.2rem;
  text-align: center;
  overflow-y: auto;
}
.trend-calendar > * {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  border-radius: 0.55rem;
  min-height: 34px;
  font-size: 0.75rem;
  line-height: 1.2;
}
.trend-calendar button {
  flex-direction: column;
  gap: 0;
}
.trend-calendar small {
  font-size: 0.65rem;
  color: var(--muted);
}
.trend-mini {
  display: block;
  width: 65%;
  height: 2px;
  background: var(--line);
}
.trend-mini span {
  display: block;
  height: 100%;
  background: var(--accent);
}
.trend-calendar button {
  border: 1px solid rgb(199 177 243 / 0.35);
}
.trend-missing {
  opacity: 0.62;
}
.trend-row[aria-pressed='true'],
.trend-calendar button[aria-pressed='true'],
.trend-row:hover,
.trend-calendar button:hover {
  background: rgb(199 177 243 / 0.14);
}
.trend-detail {
  block-size: 9rem;
  padding: 0.65rem 0.8rem;
  border: 1px solid rgb(199 177 243 / 0.18);
  border-radius: 0.8rem;
}
.trend-detail:empty {
  border-color: transparent;
}
.trend-detail-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.trend-detail .diary-times {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-block: 0.3rem 0;
  gap: 0.35rem 0.6rem;
}
.trend-detail dd {
  margin: 0;
}
.trend-rest {
  font-weight: 600;
}
.trend-empty {
  margin: auto;
}
@media (min-width: 640px) {
  .journal-trend {
    min-block-size: 21.1rem;
  }
  .trend-detail {
    block-size: 6rem;
  }
  .trend-detail .diary-times {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}
</style>
