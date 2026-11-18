<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowLeft, BookOpen, ShieldCheck } from '@lucide/vue';
import {
  journalEntries,
  journalInput,
  journalRange,
  journalTimezone,
  type JournalEntry,
} from '@jhaven/shared';
import PrimaryButton from '../components/PrimaryButton.vue';
import JournalTrend from '../components/JournalTrend.vue';
import { useAuthStore } from '../stores/auth';
import { useSpaceRequests } from '../lib/space';
import { dateInZone, shiftDate, wallTime, wallTimeCandidates } from '../domain/journal';

const auth = useAuthStore();
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const today = dateInZone(zone);
const fields = [
  { key: 'bedtime', label: '上床时间' },
  { key: 'asleep', label: '估计入睡时间' },
  { key: 'wake', label: '醒来时间' },
] as const;
const restLabels = ['很差', '较差', '一般', '较好', '很好'];
const blank = () => ({
  date: today,
  timezone: zone,
  bedtime: '',
  asleep: '',
  wake: '',
  rest: '',
  note: '',
});
const form = ref(blank());
const fold = ref({ bedtime: 0, asleep: 0, wake: 0 });
const editId = ref<string | null>(null);
const editing = ref(false);
const ready = ref(false);
const message = ref('');
const boundaries = () => ({ from: shiftDate(today, -29), to: today });
const filter = ref(boundaries());
const listed = ref<JournalEntry[]>([]);
const trend = ref<JournalEntry[]>([]);
const trendDays = ref(7);
const trendTo = ref(today);
const rangeStart = (end: string, span: number) =>
  shiftDate(end, 1 - span) < '1900-01-01' ? '1900-01-01' : shiftDate(end, 1 - span);
const trendFrom = computed(() => rangeStart(trendTo.value, trendDays.value));
const options = computed(() => {
  const valid = journalTimezone.safeParse(form.value.timezone.trim());
  return Object.fromEntries(
    fields.map(({ key }) => [
      key,
      valid.success ? wallTimeCandidates(form.value[key], valid.data) : [],
    ]),
  ) as Record<(typeof fields)[number]['key'], string[]>;
});
const { busy, error, run } = useSpaceRequests(() => {
  clearEditor();
  filter.value = boundaries();
  listed.value = [];
  trend.value = [];
  trendTo.value = today;
  trendDays.value = 7;
  ready.value = false;
  message.value = '';
});
async function list(
  request: (path?: string) => Promise<unknown>,
  range: { from: string; to: string },
) {
  return journalEntries.parse(await request('/diary?' + new URLSearchParams(range)));
}
async function load(request: (path?: string) => Promise<unknown>, period = trendDays.value) {
  const range = journalRange.safeParse(filter.value);
  if (!range.success) {
    message.value = '请选择有效的日期范围，最多 366 天。';
    return;
  }
  const end = range.data.to;
  const [records, series] = await Promise.all([
    list(request, range.data),
    list(request, { from: rangeStart(end, period), to: end }),
  ]);
  listed.value = records;
  trend.value = series;
  trendDays.value = period;
  trendTo.value = end;
  ready.value = true;
}
watch(
  () => auth.user?.id,
  (id) => {
    if (id) void run(load);
  },
  { immediate: true },
);
function clearEditor() {
  editing.value = false;
  editId.value = null;
  form.value = blank();
  fold.value = { bedtime: 0, asleep: 0, wake: 0 };
}
function edit(entry?: JournalEntry) {
  clearEditor();
  editing.value = true;
  if (!entry) return;
  editId.value = entry.id;
  form.value = {
    date: entry.date,
    timezone: entry.timezone,
    bedtime: '',
    asleep: '',
    wake: '',
    rest: entry.rest === null ? '' : String(entry.rest),
    note: entry.note,
  };
  for (const { key } of fields)
    if (entry[key]) {
      form.value[key] = wallTime(entry[key], entry.timezone);
      fold.value[key] = Math.max(
        0,
        wallTimeCandidates(form.value[key], entry.timezone).indexOf(entry[key]),
      );
    }
}
function save() {
  message.value = '';
  const id = editId.value;
  const zone = form.value.timezone.trim();
  if (!journalTimezone.safeParse(zone).success) {
    message.value = '请填写有效的 IANA 时区，例如 Asia/Macau。';
    return;
  }
  const times = { bedtime: null, asleep: null, wake: null } as Record<
    (typeof fields)[number]['key'],
    string | null
  >;
  for (const { key, label } of fields) {
    if (!form.value[key]) continue;
    const candidates = options.value[key];
    const chosen = candidates[fold.value[key]] ?? candidates[0];
    if (!chosen) {
      message.value = label + '在所选时区不存在，请核对日期和夏令时。';
      return;
    }
    times[key] = chosen;
  }
  const parsed = journalInput.safeParse({
    date: form.value.date,
    timezone: zone,
    ...times,
    rest: form.value.rest ? Number(form.value.rest) : null,
    note: form.value.note,
  });
  if (!parsed.success) {
    message.value =
      parsed.error.issues[0]?.code === 'custom'
        ? parsed.error.issues[0].message
        : '请检查日期、时间和备注长度。';
    return;
  }
  void run(async (request) => {
    await request(id ? '/diary/' + id : '/diary', id ? 'PUT' : 'POST', parsed.data);
    clearEditor();
    if (parsed.data.date < filter.value.from || parsed.data.date > filter.value.to)
      filter.value = { from: rangeStart(parsed.data.date, 30), to: parsed.data.date };
    await load(request);
    message.value = '日记已保存。';
  });
}
function remove(entry: JournalEntry) {
  if (!window.confirm('删除 ' + entry.date + ' 的日记？')) return;
  message.value = '';
  void run(async (request) => {
    await request('/diary/' + entry.id, 'DELETE');
    if (editId.value === entry.id) clearEditor();
    await load(request);
    message.value = '日记已删除。';
  });
}
const showTime = (value: string | null, timezone: string) =>
  value ? wallTime(value, timezone).replace('T', ' ').slice(0, 16) : '—';
</script>
<template>
  <div class="content-page journal-page page-enter space-page">
    <RouterLink class="quiet-link back-link" to="/"
      ><ArrowLeft :size="16" aria-hidden="true" />回到今晚</RouterLink
    >
    <div v-if="!auth.user" class="journal-page-icon" aria-hidden="true">
      <BookOpen :size="39" :stroke-width="1.1" />
    </div>
    <template v-if="!auth.user">
      <h1 tabindex="-1">日记，慢慢来。</h1>
      <p class="page-lead">有些夜晚，值得被轻轻记住。</p>
      <div class="foundation-notice">
        <ShieldCheck :size="22" aria-hidden="true" />
        <p><strong>先把隐私，放在前面。</strong><br />睡眠日记仅供你本人查看和管理。</p>
      </div>
      <div class="space-actions">
        <PrimaryButton to="/login">登录后记录</PrimaryButton
        ><RouterLink to="/relax" class="button button-secondary">看看夜晚的场景</RouterLink>
      </div>
    </template>
    <template v-else>
      <h1 tabindex="-1">我的睡眠日记</h1>
      <p class="page-lead">随时记录，也可以留空。选择夜晚所属日期，跨午夜的时间请填写实际日期。</p>
      <p v-if="error" class="field-error" role="alert">{{ error }}</p>
      <p v-if="message" class="auth-hint" role="status">{{ message }}</p>
      <p v-if="busy" class="auth-hint" role="status">正在处理…</p>
      <button
        v-if="!ready && !busy"
        class="button button-secondary"
        type="button"
        @click="run(load)"
      >
        重试读取日记
      </button>
      <template v-if="ready">
        <section class="space-section" aria-labelledby="diary-title">
          <div class="space-actions">
            <h2 id="diary-title">记录</h2>
            <button type="button" class="button button-primary" :disabled="busy" @click="edit()">
              新增日记
            </button>
          </div>
          <form
            class="space-form"
            @submit.prevent="
              message = '';
              run(load);
            "
          >
            <div class="space-fields">
              <label>查询开始日期 <input v-model="filter.from" type="date" required /></label>
              <label>查询结束日期 <input v-model="filter.to" type="date" required /></label>
            </div>
            <button class="button button-secondary" type="submit" :disabled="busy">查询日期</button>
          </form>
          <form
            v-if="editing"
            class="space-form diary-editor"
            aria-label="日记表单"
            @submit.prevent="save"
          >
            <h3>{{ editId ? '编辑日记' : '新建日记' }}</h3>
            <div class="space-fields">
              <label>日记日期 <input v-model="form.date" type="date" required /></label>
              <label
                >记录时区
                <input v-model="form.timezone" maxlength="64" placeholder="Asia/Macau" required
              /></label>
            </div>
            <div class="space-fields">
              <div v-for="{ key, label } in fields" :key="key">
                <label
                  >{{ label }}
                  <input v-model="form[key]" type="datetime-local" step="1" @change="fold[key] = 0"
                /></label>
                <label v-if="options[key].length > 1"
                  >{{ label }}的夏令时重叠
                  <select v-model.number="fold[key]">
                    <option :value="0">第一次出现</option>
                    <option :value="1">第二次出现</option>
                  </select>
                </label>
              </div>
            </div>
            <label
              >主观休息感
              <select v-model="form.rest">
                <option value="">不记录</option>
                <option v-for="(value, i) in restLabels" :key="value" :value="String(i + 1)">
                  {{ value }}
                </option>
              </select>
            </label>
            <label>备注（可选） <textarea v-model="form.note" rows="3" maxlength="2000" /></label>
            <div class="space-actions">
              <button type="submit" class="button button-primary" :disabled="busy">保存日记</button>
              <button
                type="button"
                class="button button-secondary"
                :disabled="busy"
                @click="clearEditor"
              >
                取消
              </button>
            </div>
          </form>
          <ul v-if="listed.length" class="space-list">
            <li v-for="entry in listed" :key="entry.id">
              <div>
                <strong>{{ entry.date }}</strong>
                <span class="auth-hint">{{ entry.timezone }}</span>
                <dl class="diary-times">
                  <div v-for="field in fields" :key="field.key">
                    <dt>{{ field.label }}</dt>
                    <dd>{{ showTime(entry[field.key], entry.timezone) }}</dd>
                  </div>
                  <div>
                    <dt>主观休息感</dt>
                    <dd>{{ entry.rest === null ? '—' : restLabels[entry.rest - 1] }}</dd>
                  </div>
                </dl>
                <p v-if="entry.note" class="diary-note">{{ entry.note }}</p>
              </div>
              <div class="space-actions">
                <button class="quiet-link" type="button" :disabled="busy" @click="edit(entry)">
                  编辑<span class="sr-only"> {{ entry.date }}</span></button
                ><button type="button" class="quiet-link" :disabled="busy" @click="remove(entry)">
                  删除<span class="sr-only"> {{ entry.date }}</span>
                </button>
              </div>
            </li>
          </ul>
          <p v-else class="auth-hint">所选日期范围内没有日记。</p>
        </section>
        <section class="space-section" aria-labelledby="trends-title">
          <h2 id="trends-title">睡眠趋势</h2>
          <div class="space-actions">
            <button
              v-for="period in [7, 30]"
              :key="period"
              type="button"
              class="sound-action"
              :aria-pressed="trendDays === period"
              :disabled="busy"
              @click="
                message = '';
                run((request) => load(request, period));
              "
            >
              最近 {{ period }} 天
            </button>
          </div>
          <p class="auth-hint">
            趋势截至所查询的结束日期。每项时间使用记录时区，空缺日期保留空白。
          </p>
          <JournalTrend :entries="trend" :from="trendFrom" :to="trendTo" />
        </section>
      </template>
    </template>
  </div>
</template>
