<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ChatFilter, ChatSummary } from '@jhaven/shared';
import ModalPanel from './ModalPanel.vue';
import type { useChatHistory } from '../composables/useChatHistory';

const props = defineProps<{ signedIn: boolean; history: ReturnType<typeof useChatHistory> }>();
const emit = defineEmits<{ close: []; open: [id: string] }>();
const { rows, state, busy, error } = props.history;
const search = ref('');
const filter = ref<ChatFilter>('all');
const editing = ref<string>();
const title = ref('');
const confirming = ref<string>();
const loaded = ref(false);
const date = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
function sources(row: ChatSummary) {
  return [
    ...row.providers.map((provider) => (provider === 'deepseek' ? 'DeepSeek' : 'OpenAI')),
    row.sources.includes('ai') && !row.providers.length ? 'AI' : '',
    row.sources.includes('local') ? '本地知识' : '',
    row.sources.includes('fallback') ? '本地回退' : '',
    row.sources.includes('error') ? '请求未完成' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
async function refresh() {
  if (!props.signedIn) return;
  await props.history.list(search.value, filter.value);
  loaded.value = true;
}
watch(
  () => props.signedIn && !busy.value && !loaded.value,
  (ready) => {
    if (ready) void refresh();
  },
  { immediate: true },
);
async function rename(id: string) {
  if (title.value.trim() && (await props.history.rename(id, title.value.trim())))
    editing.value = undefined;
}
async function remove() {
  const key = confirming.value;
  if (!key) return;
  if (await (key === 'all' ? props.history.clear() : props.history.remove(key)))
    confirming.value = undefined;
}
</script>

<template>
  <ModalPanel title="聊天历史" close-label="关闭聊天历史" eyebrow="" @close="emit('close')">
    <div v-if="!signedIn" class="chat-history-controls">
      <p>登录后可把对话保存在 JHaven 账户中，在其他设备打开。访客可以继续聊天。</p>
      <RouterLink class="button button-secondary" to="/login">登录账户</RouterLink>
    </div>
    <div v-else class="chat-history-controls">
      <label class="assistant-consent">
        <input
          type="checkbox"
          :checked="state?.autoSave ?? false"
          :disabled="busy || !state"
          @change="history.autoSave(($event.target as HTMLInputElement).checked)"
        />
        自动保存后续对话
      </label>
      <p class="assistant-muted">默认关闭。关闭后不会删除已有历史。</p>
      <form class="chat-history-controls" @submit.prevent="refresh">
        <label>搜索标题或消息 <input v-model="search" type="search" maxlength="120" /></label>
        <label
          >回答来源
          <select v-model="filter">
            <option value="all">全部</option>
            <option value="deepseek">DeepSeek</option>
            <option value="local">本地知识及回退</option>
            <option value="mixed">混合模式</option>
          </select>
        </label>
        <button class="button button-secondary" :disabled="busy" type="submit">查询历史</button>
      </form>
      <p v-if="busy" role="status">正在处理聊天历史…</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="!busy && !error && !rows.length" role="status">没有符合条件的已保存对话。</p>
      <ul v-if="rows.length" class="chat-history-list">
        <li v-for="row in rows" :key="row.id">
          <button class="quiet-link" type="button" :disabled="busy" @click="emit('open', row.id)">
            {{ row.title }}
          </button>
          <p class="assistant-muted">
            {{ date.format(new Date(row.updatedAt)) }} · {{ row.messageCount }} 条消息
          </p>
          <p class="assistant-muted">{{ sources(row) }}</p>
          <form
            v-if="editing === row.id"
            class="chat-history-controls"
            @submit.prevent="rename(row.id)"
          >
            <label>新标题 <input v-model="title" required maxlength="100" /></label>
            <button class="button button-secondary" :disabled="busy" type="submit">保存标题</button>
            <button type="button" class="quiet-link" @click="editing = undefined">
              取消重命名
            </button>
          </form>
          <div v-else class="chat-history-actions">
            <button
              type="button"
              class="quiet-link"
              :disabled="busy"
              @click="
                editing = row.id;
                title = row.title;
              "
            >
              重命名
            </button>
            <button type="button" class="quiet-link" :disabled="busy" @click="confirming = row.id">
              删除
            </button>
          </div>
        </li>
      </ul>
      <button class="quiet-link" type="button" :disabled="busy" @click="confirming = 'all'">
        清空聊天历史
      </button>
      <div
        v-if="confirming"
        class="chat-history-controls"
        role="group"
        aria-label="确认删除聊天历史"
      >
        <p>
          {{
            confirming === 'all'
              ? '删除账户中所有已保存的对话？此操作无法撤销。'
              : '删除这条已保存的对话？此操作无法撤销。'
          }}
        </p>
        <div class="chat-history-actions">
          <button class="button button-secondary" type="button" @click="confirming = undefined">
            保留
          </button>
          <button class="button button-secondary" type="button" :disabled="busy" @click="remove">
            {{ confirming === 'all' ? '确认清空全部' : '确认删除对话' }}
          </button>
        </div>
      </div>
    </div>
  </ModalPanel>
</template>
