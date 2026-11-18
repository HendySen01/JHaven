<script setup lang="ts">
import { computed } from 'vue';
import type { JournalEntry } from '@jhaven/shared';
import { dayDistance, journalHour, wallTime } from '../domain/journal';

const props = defineProps<{ entries: JournalEntry[]; from: string; to: string }>();
const tracks = [
  { key: 'bedtime', label: '上床', color: '#c7b1f3' },
  { key: 'asleep', label: '估计入睡', color: '#79c6d5' },
  { key: 'wake', label: '醒来', color: '#edc68d' },
] as const;
const restLabels = ['很差', '较差', '一般', '较好', '很好'];
const days = computed(() => dayDistance(props.from, props.to));
const values = computed(() =>
  tracks.map((track) => ({
    ...track,
    points: props.entries
      .flatMap((entry) => {
        const value = journalHour(entry.date, entry[track.key], entry.timezone);
        return value === null ? [] : [{ day: dayDistance(props.from, entry.date), value }];
      })
      .sort((a, b) => a.day - b.day),
  })),
);
const rest = computed(() =>
  props.entries
    .flatMap((entry) =>
      entry.rest === null ? [] : [{ day: dayDistance(props.from, entry.date), value: entry.rest }],
    )
    .sort((a, b) => a.day - b.day),
);
const hours = computed(() => values.value.flatMap((series) => series.points.map((p) => p.value)));
const lower = computed(() => Math.floor(Math.min(18, ...hours.value) / 6) * 6);
const upper = computed(() => Math.ceil(Math.max(30, ...hours.value) / 6) * 6);
const ticks = computed(() =>
  Array.from({ length: 5 }, (_, i) =>
    Math.round(lower.value + ((upper.value - lower.value) * i) / 4),
  ),
);
const x = (day: number) => 58 + (day / Math.max(days.value, 1)) * 540;
const y = (value: number, min: number, max: number) => 135 - ((value - min) / (max - min)) * 111;
const label = (hour: number) => {
  const clock = `${((hour % 24) + 24) % 24}:00`;
  const offset = Math.floor(hour / 24);
  return offset === 0 ? clock : `${offset > 0 ? '+' : ''}${offset}日 ${clock}`;
};
function segments(points: { day: number; value: number }[]) {
  return points.flatMap((point, i) =>
    points[i - 1]?.day === point.day - 1 ? [{ start: points[i - 1]!, end: point }] : [],
  );
}
const display = (value: string | null, timezone: string) =>
  value ? wallTime(value, timezone).replace('T', ' ').slice(0, 16) : '—';
</script>
<template>
  <p v-if="!entries.length" class="auth-hint">这段时间暂无记录。图表会在你记录后更新。</p>
  <template v-else>
    <h3>作息时间</h3>
    <p v-if="!hours.length" class="auth-hint">这段时间暂无作息时间。</p>
    <template v-else>
      <ul class="trend-legend">
        <li v-for="item in tracks" :key="item.key">
          <svg width="12" height="12" aria-hidden="true">
            <circle cx="6" cy="6" r="5" :fill="item.color" /></svg
          >{{ item.label }}
        </li>
      </ul>
      <svg
        class="trend-svg"
        viewBox="0 0 620 160"
        role="img"
        aria-label="作息时间。横轴为记录日期，纵轴为记录当地时间，跨日以偏移天数表示。对应数值见下表。"
      >
        <g v-for="tick in ticks" :key="tick">
          <line x1="58" x2="598" :y1="y(tick, lower, upper)" :y2="y(tick, lower, upper)" />
          <text x="52" :y="y(tick, lower, upper) + 4" text-anchor="end">{{ label(tick) }}</text>
        </g>
        <g v-for="series in values" :key="series.key" :stroke="series.color" :fill="series.color">
          <line
            v-for="{ start, end } in segments(series.points)"
            :key="start.day"
            :x1="x(start.day)"
            :x2="x(end.day)"
            :y1="y(start.value, lower, upper)"
            :y2="y(end.value, lower, upper)"
          />
          <circle
            v-for="point in series.points"
            :key="point.day"
            :cx="x(point.day)"
            :cy="y(point.value, lower, upper)"
            r="3.5"
          />
        </g>
        <text x="58" y="153">{{ from }}</text>
        <text x="598" y="153" text-anchor="end">{{ to }}</text>
      </svg>
    </template>
    <h3>主观休息感</h3>
    <p v-if="!rest.length" class="auth-hint">这段时间暂无休息感记录。</p>
    <svg
      v-else
      class="trend-svg"
      viewBox="0 0 620 160"
      role="img"
      aria-label="主观休息感趋势，由很差到很好。对应记录见下表。"
    >
      <g v-for="(item, i) in restLabels" :key="item">
        <line x1="58" x2="598" :y1="y(i + 1, 1, 5)" :y2="y(i + 1, 1, 5)" />
        <text x="52" :y="y(i + 1, 1, 5) + 4" text-anchor="end">{{ item }}</text>
      </g>
      <g stroke="#c7b1f3" fill="#c7b1f3">
        <line
          v-for="{ start, end } in segments(rest)"
          :key="start.day"
          :x1="x(start.day)"
          :x2="x(end.day)"
          :y1="y(start.value, 1, 5)"
          :y2="y(end.value, 1, 5)"
        />
        <circle
          v-for="point in rest"
          :key="point.day"
          :cx="x(point.day)"
          :cy="y(point.value, 1, 5)"
          r="3.5"
        />
      </g>
      <text x="58" y="153">{{ from }}</text>
      <text x="598" y="153" text-anchor="end">{{ to }}</text>
    </svg>
    <div class="space-table" tabindex="0" role="region" aria-label="趋势数据表">
      <table>
        <caption>
          真实记录，空值以「—」表示
        </caption>
        <thead>
          <tr>
            <th scope="col">日期 / 时区</th>
            <th v-for="item in tracks" :key="item.key" scope="col">{{ item.label }}</th>
            <th scope="col">休息感</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in entries" :key="entry.id">
            <th scope="row">{{ entry.date }}<br />{{ entry.timezone }}</th>
            <td v-for="item in tracks" :key="item.key">
              {{ display(entry[item.key], entry.timezone) }}
            </td>
            <td>{{ entry.rest === null ? '—' : restLabels[entry.rest - 1] }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>
