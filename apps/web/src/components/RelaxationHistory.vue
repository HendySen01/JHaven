<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { z } from 'zod';
import { relaxationRecord } from '@jhaven/shared';
import { practices } from '../domain/relaxation';
import { useSpaceRequests } from '../lib/space';

const records = ref<z.infer<typeof relaxationRecord>[]>([]);
const { busy, error, run } = useSpaceRequests(() => {
  records.value = [];
});
const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
function load() {
  void run(async (request) => {
    records.value = z.array(relaxationRecord).parse(await request('/relaxation'));
  });
}
function remove(id: string) {
  if (!window.confirm('删除这条练习记录？')) return;
  void run(async (request) => {
    await request('/relaxation/' + id, 'DELETE');
    records.value = records.value.filter((item) => item.id !== id);
  });
}
onMounted(load);
</script>

<template>
  <section
    id="relaxation-history"
    class="space-panel"
    aria-labelledby="relaxation-history-title"
    :data-page-recovery-loading="busy"
  >
    <h2 id="relaxation-history-title">放松练习记录</h2>
    <p>这里只显示你主动保存的最近 50 条练习。每条都可以删除。</p>
    <p v-if="error" role="alert">
      {{ error }} <button class="quiet-link" type="button" @click="load">重试</button>
    </p>
    <p v-else-if="busy" role="status">正在处理…</p>
    <p v-else-if="!records.length">还没有保存的练习。</p>
    <ul v-if="records.length" class="practice-options">
      <li v-for="record in records" :key="record.id">
        <strong>{{ practices[record.practice].title }}</strong>
        <time :datetime="record.createdAt">{{
          dateFormat.format(new Date(record.createdAt))
        }}</time>
        <span>{{ record.seconds }} 秒 · {{ record.completed ? '完成' : '提前结束' }}</span>
        <button class="quiet-link" type="button" :disabled="busy" @click="remove(record.id)">
          删除记录
        </button>
      </li>
    </ul>
  </section>
</template>
