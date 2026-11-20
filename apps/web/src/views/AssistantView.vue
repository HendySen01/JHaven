<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { MoonStar, ArrowUpRight } from '@lucide/vue';
import {
  assistantAction,
  assistantStatus,
  type AssistantAction,
  type AssistantEvent,
  type AssistantMode,
  type AssistantProviderId,
} from '@jhaven/shared';
import { useRouter } from 'vue-router';
import { findScene } from '../domain/evening';
import { practices } from '../domain/relaxation';
import { useEveningStore } from '../stores/evening';
import { useAuthStore } from '../stores/auth';
import { AssistantRequestError, readAssistant } from '../lib/assistant';

type Result = Extract<AssistantEvent, { type: 'done' }>;
type Turn = {
  question: string;
  text: string;
  source?: 'ai' | 'local' | 'fallback' | 'error';
  result?: Result;
  recipient?: string;
  note?: string;
};
const router = useRouter();
const evening = useEveningStore();
const auth = useAuthStore();
const draft = ref('');
const composing = ref(false);
let compositionEndedAt = -Infinity;
const turns = ref<Turn[]>([]);
const active = ref(false);
const assistantMode = ref<AssistantMode>('local');
const consent = computed({
  get: () => assistantMode.value === 'ai',
  set: (on) => {
    assistantMode.value = on ? 'ai' : 'local';
  },
});
const providerNames = { openai: 'OpenAI', deepseek: 'DeepSeek' } as const;
const providers = ref<{ id: AssistantProviderId; model?: string }[]>([]);
const recipient = ref<AssistantProviderId>();
const selectedProvider = computed(() => providers.value.find(({ id }) => id === recipient.value));
const providerName = computed(() => (recipient.value ? providerNames[recipient.value] : null));
const cooldowns = ref(new Set<AssistantProviderId | 'all'>());
const retryBlocked = computed(
  () =>
    cooldowns.value.has('all') ||
    (assistantMode.value === 'ai' && !!recipient.value && cooldowns.value.has(recipient.value)),
);
const retryTimers = new Map<AssistantProviderId | 'all', ReturnType<typeof setTimeout>>();
function clearRetryTimers() {
  for (const timer of retryTimers.values()) clearTimeout(timer);
  retryTimers.clear();
}
const sourceLabels = {
  ai: 'AI 辅助回答',
  local: '本地知识',
  fallback: '本地回退',
  error: '请求未完成',
};
const configured = computed(() => !!selectedProvider.value);
const checking = ref(true);
const statusUnavailable = ref(false);
const privacy = ref(false);
const pending = ref<AssistantAction | null>(null);
const textarea = ref<HTMLTextAreaElement>();
const confirmation = ref<HTMLButtonElement>();
const stopButton = ref<HTMLButtonElement>();
let recommendationTrigger: HTMLButtonElement | undefined;
const last = computed(() => turns.value.at(-1));
let request: AbortController | undefined;
const statusController = new AbortController();

onMounted(async () => {
  try {
    const res = await fetch('/api/assistant/status', {
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.any([statusController.signal, AbortSignal.timeout(4000)]),
    });
    if (!res.ok) throw new Error('无法检查助手服务。');
    const status = assistantStatus.parse(await res.json());
    providers.value = status.providers ?? (status.provider ? [{ id: status.provider }] : []);
    recipient.value = providers.value[0]?.id;
  } catch {
    statusUnavailable.value = true;
  } finally {
    checking.value = false;
  }
});
function stop(note = '已停止生成。') {
  if (!request) return;
  restoreComposerFocus();
  request.abort();
  request = undefined;
  active.value = false;
  if (last.value) last.value.note = note;
}
function restoreComposerFocus() {
  if (document.activeElement === stopButton.value) textarea.value?.focus({ preventScroll: true });
}
function reset() {
  stop();
  turns.value = [];
  draft.value = '';
  pending.value = null;
  consent.value = false;
  clearRetryTimers();
  cooldowns.value.clear();
}
watch(() => auth.user?.id, reset);
onBeforeUnmount(() => {
  statusController.abort();
  clearRetryTimers();
  stop();
});
watch(
  assistantMode,
  (value) => {
    if (value === 'local' && active.value) stop('已停止本次请求，后续将使用本地知识。');
  },
  { flush: 'sync' },
);
watch(
  recipient,
  () => {
    if (assistantMode.value === 'ai') {
      stop('已停止本次请求。切换供应商后需要重新同意。');
      assistantMode.value = 'local';
    }
  },
  { flush: 'sync' },
);
function useLocalKnowledge() {
  const question = last.value?.question;
  assistantMode.value = 'local';
  if (question) void send(question, true);
}
function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey)
    return;
  if (
    composing.value ||
    event.isComposing ||
    event.keyCode === 229 ||
    !window.matchMedia('(hover: hover) and (pointer: fine)').matches
  )
    return;
  event.preventDefault();
  // 部分浏览器在确认候选词的 Enter 前先派发 compositionend。
  if (event.repeat || event.timeStamp - compositionEndedAt < 50) return;
  void send(draft.value);
}
async function send(question: string, replace = false, event?: Event) {
  const mode = assistantMode.value;
  const target = mode === 'ai' ? selectedProvider.value : undefined;
  if (active.value || retryBlocked.value || !question.trim()) return;
  const control =
    event instanceof SubmitEvent && event.submitter ? event.submitter : event?.currentTarget;
  const moveFocus = control === document.activeElement;
  pending.value = null;
  const identity = target
    ? providerNames[target.id] + (target.model ? ` · ${target.model}` : '')
    : undefined;
  const current: Turn = {
    question: question.trim(),
    text: '',
    ...(identity ? { recipient: identity } : {}),
  };
  const submittedDraft = !replace && draft.value.trim() === current.question ? draft.value : null;
  turns.value = [...(replace ? turns.value.slice(0, -1) : turns.value).slice(-3), current];
  const previous = turns.value.at(-2);
  const earlier = turns.value.at(-3);
  const contextReply = (turn?: Turn) =>
    target && turn?.source === 'ai' && turn.result && turn.recipient === identity
      ? turn.text.slice(0, 400).trim() || undefined
      : undefined;
  const previousReply = contextReply(previous);
  const earlierReply = previousReply ? contextReply(earlier) : undefined;
  const messageCount = !target || earlierReply ? 3 : previousReply ? 2 : 1;
  const messages = turns.value.slice(-messageCount).map((turn) => turn.question);
  const controller = new AbortController();
  request = controller;
  active.value = true;
  if (moveFocus) void nextTick(() => stopButton.value?.focus({ preventScroll: true }));
  try {
    await readAssistant(
      messages,
      mode,
      AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
      (event) => {
        if (request !== controller || !last.value) return;
        if (event.type === 'start')
          last.value.source = event.source ?? (event.mode === 'model' ? 'ai' : 'local');
        if (event.type === 'text') last.value.text += event.text;
        if (event.type === 'done') {
          last.value.result = event;
          if (event.source) last.value.source = event.source;
          if (submittedDraft !== null && draft.value === submittedDraft) draft.value = '';
        }
      },
      target
        ? {
            provider: target.id,
            ...(target.model ? { model: target.model } : {}),
            ...(previousReply ? { previousReply } : {}),
            ...(earlierReply ? { earlierReply } : {}),
          }
        : {},
    );
  } catch (error) {
    if (request === controller && last.value) {
      last.value.source = 'error';
      if (error instanceof AssistantRequestError && error.retryAfter) {
        const scope = error.code === 'ASSISTANT_LIMIT' ? 'all' : (target?.id ?? 'all');
        clearTimeout(retryTimers.get(scope));
        cooldowns.value.add(scope);
        retryTimers.set(
          scope,
          setTimeout(
            () => {
              cooldowns.value.delete(scope);
              retryTimers.delete(scope);
            },
            Math.min(86_400, error.retryAfter) * 1000,
          ),
        );
      }
      last.value.note =
        error instanceof DOMException && error.name === 'TimeoutError'
          ? '这次回复超过等待时间，可以重试或使用本地知识。'
          : error instanceof TypeError
            ? '网络连接中断，可以重试。'
            : error instanceof Error && error.name !== 'ZodError' && !(error instanceof SyntaxError)
              ? error.message
              : '回复格式异常，可以重试。';
    }
  } finally {
    if (request === controller) {
      restoreComposerFocus();
      request = undefined;
      active.value = false;
    }
  }
}
function label(action: AssistantAction) {
  return action.kind === 'practice'
    ? practices[action.id].title
    : (findScene(action.id)?.name ?? '声音场景');
}
function propose(action: AssistantAction, event: MouseEvent) {
  if (event.currentTarget instanceof HTMLButtonElement) recommendationTrigger = event.currentTarget;
  pending.value = action;
  void nextTick(() => confirmation.value?.focus());
}
function cancelConfirmation() {
  pending.value = null;
  recommendationTrigger?.focus();
}
function confirm() {
  const parsed = assistantAction.safeParse(pending.value);
  if (!parsed.success) return;
  const action = parsed.data;
  evening.selectedMood = action.mood;
  void router.push(action.kind === 'practice' ? '/practice/' + action.id : '/relax/' + action.id);
}
function clearChat() {
  reset();
  textarea.value?.focus();
}
const quick = ['思绪停不下来', '白噪声有助睡眠吗？', '现在没有睡意'];
</script>

<template>
  <div class="content-page assistant-page">
    <header class="assistant-intro">
      <span class="assistant-symbol" aria-hidden="true"
        ><MoonStar :size="24" :stroke-width="1.4"
      /></span>
      <h1 tabindex="-1">睡前助手</h1>
      <p class="page-lead">今晚想说点什么？从小事聊起也可以。</p>
    </header>
    <section class="assistant-panel" aria-labelledby="chat-title">
      <h2 id="chat-title" class="assistant-sr">聊天</h2>
      <div class="assistant-mode">
        <strong role="status">{{
          configured && consent ? 'AI 模式' : checking ? '正在检查助手服务…' : '本地知识模式'
        }}</strong>
        <label v-if="providers.length > 1" class="assistant-provider">
          AI 供应商
          <select v-model="recipient">
            <option v-for="provider in providers" :key="provider.id" :value="provider.id">
              {{ providerNames[provider.id] }} · {{ provider.model }}
            </option>
          </select>
        </label>
        <button
          class="quiet-link"
          type="button"
          :aria-expanded="privacy"
          @click="privacy = !privacy"
        >
          隐私与来源<ArrowUpRight :size="14" aria-hidden="true" />
        </button>
      </div>
      <div v-if="privacy" class="assistant-privacy">
        <p>
          消息通过 JHaven 服务处理。助手不会读取账户里的睡眠日记，请勿在输入框粘贴私人内容或凭据。
        </p>
        <p>本站不长期保存聊天。离开页面或清空对话会清除浏览器内存记录。</p>
        <p v-if="providerName">
          开启 AI 模式后，本次输入和最多两轮同一供应商的 AI 对话可能发送给
          {{ providerName }}。留存适用其平台政策。<a
            :href="
              providerName === 'DeepSeek'
                ? 'https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html'
                : 'https://developers.openai.com/api/docs/guides/your-data'
            "
            target="_blank"
            rel="noopener noreferrer"
            >查看 {{ providerName }} 数据说明</a
          >
        </p>
        <RouterLink class="quiet-link" to="/relaxation-evidence">放松依据与边界</RouterLink>
      </div>
      <p v-if="!configured && !checking" class="assistant-muted">
        {{
          statusUnavailable
            ? '暂时无法确认 AI 服务状态。可以尝试查询本地审核知识。'
            : '当前可用审核知识和站内推荐，模型服务未启用。'
        }}
      </p>
      <label v-if="configured" class="assistant-consent">
        <input v-model="consent" type="checkbox" /> 同意将本次输入和最多两轮同一供应商的 AI
        对话发送给 {{ providerName
        }}{{ selectedProvider?.model ? ` · ${selectedProvider.model}` : '' }}
      </label>
      <ul v-if="!turns.length" class="assistant-quick">
        <li v-for="question in quick" :key="question">
          <button
            class="button button-secondary"
            type="button"
            @click="send(question, false, $event)"
            :disabled="active || retryBlocked"
          >
            {{ question }}
          </button>
        </li>
      </ul>
      <ol v-else class="assistant-thread" aria-label="近期对话">
        <li v-for="(turn, index) in turns" :key="index" class="assistant-turn">
          <p class="assistant-question">{{ turn.question }}</p>
          <div class="assistant-reply">
            <p v-if="turn.source" class="assistant-reply-mode">
              {{ sourceLabels[turn.source] }}
              <span v-if="turn.source === 'ai' && turn.recipient"> · {{ turn.recipient }}</span>
            </p>
            <p v-if="turn.text" class="assistant-text">{{ turn.text }}</p>
            <p v-if="turn.note" class="assistant-muted" role="status">{{ turn.note }}</p>
            <p v-if="!turn.text && !turn.note" class="assistant-muted">正在准备回复…</p>
            <details v-if="turn.result?.sources.length">
              <summary>查看来源与证据</summary>
              <ul class="assistant-sources">
                <li v-for="source in turn.result.sources" :key="source.id">
                  <a :href="source.url" target="_blank" rel="noopener noreferrer">{{
                    source.title
                  }}</a>
                  <p>{{ source.published }} · {{ source.population }}</p>
                  <p>{{ source.evidence }} {{ source.limits }}</p>
                </li>
              </ul>
            </details>
            <p
              v-if="turn.result?.reason && turn.result.reason !== turn.text"
              class="assistant-muted"
            >
              {{ turn.result.reason }}
            </p>
            <div
              v-if="index === turns.length - 1 && turn.result?.actions.length"
              class="assistant-actions"
            >
              <button
                v-for="action in turn.result.actions"
                :key="action.kind + action.id"
                class="button button-secondary"
                type="button"
                @click="propose(action, $event)"
              >
                推荐 · {{ label(action) }}
              </button>
            </div>
          </div>
        </li>
      </ol>
      <div v-if="pending" class="assistant-confirm" @keydown.esc.stop="cancelConfirmation">
        <p>前往「{{ label(pending) }}」？声音和练习仍由你开始。</p>
        <button ref="confirmation" class="button button-primary" type="button" @click="confirm">
          确认前往
        </button>
        <button class="quiet-link" type="button" @click="cancelConfirmation">取消</button>
      </div>
      <p class="assistant-sr" aria-live="polite">
        {{ active ? '正在生成回复' : last?.result ? last.text : '' }}
      </p>
      <form class="assistant-compose" @submit.prevent="send(draft, false, $event)">
        <label for="assistant-message">今晚想聊什么</label>
        <textarea
          id="assistant-message"
          ref="textarea"
          v-model="draft"
          rows="2"
          maxlength="400"
          placeholder="随便聊聊，或者说说今天发生的事。"
          aria-describedby="assistant-composer-hint"
          @keydown="handleComposerKeydown"
          @compositionstart="composing = true"
          @compositionend="
            composing = false;
            compositionEndedAt = $event.timeStamp;
          "
        />
        <p id="assistant-composer-hint" class="assistant-keyboard-hint">
          Enter 发送 · Shift + Enter 换行
        </p>
        <div class="assistant-actions">
          <button
            v-if="active"
            ref="stopButton"
            class="button button-secondary"
            type="button"
            @click="stop()"
          >
            停止生成
          </button>
          <button
            v-else
            class="button button-primary"
            type="submit"
            :disabled="!draft.trim() || retryBlocked"
          >
            发送
          </button>
          <button
            v-if="last && !active"
            class="quiet-link"
            type="button"
            @click="send(last.question, true, $event)"
            :disabled="retryBlocked"
          >
            {{ last.note ? '重试回复' : '重新生成' }}
          </button>
          <button
            v-if="last && consent && (last.note || active)"
            class="quiet-link"
            type="button"
            @click="useLocalKnowledge"
          >
            改用本地知识
          </button>
          <button v-if="turns.length" class="quiet-link" type="button" @click="clearChat">
            清空对话
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
