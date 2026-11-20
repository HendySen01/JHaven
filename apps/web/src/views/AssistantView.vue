<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { MoonStar, ArrowUpRight } from '@lucide/vue';
import {
  assistantAction,
  assistantHistoryLimit,
  assistantStatus,
  type AssistantExchange,
  type AssistantAction,
  type AssistantMode,
  type AssistantProviderId,
} from '@jhaven/shared';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { findScene } from '../domain/evening';
import { practices } from '../domain/relaxation';
import { useEveningStore } from '../stores/evening';
import { useAuthStore } from '../stores/auth';
import { useAssistantStore } from '../stores/assistant';
import { AssistantRequestError, readAssistant } from '../lib/assistant';

const router = useRouter();
const evening = useEveningStore();
const auth = useAuthStore();
const conversation = useAssistantStore();
const { turns, draft } = storeToRefs(conversation);
const composing = ref(false);
let compositionEndedAt = -Infinity;
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
type Cooldown = AssistantProviderId | AssistantMode;
const cooldowns = ref(new Set<Cooldown>());
const retryBlocked = computed(
  () =>
    cooldowns.value.has(assistantMode.value) ||
    (assistantMode.value === 'ai' && !!recipient.value && cooldowns.value.has(recipient.value)),
);
const retryTimers = new Map<Cooldown, ReturnType<typeof setTimeout>>();
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
const historyWindow = ref<HTMLElement>();
const following = ref(true);
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
  pending.value = null;
  consent.value = false;
  clearRetryTimers();
  cooldowns.value.clear();
  following.value = true;
}
watch(() => auth.user?.id, reset, { flush: 'sync' });
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
function readScrollPosition() {
  const pane = historyWindow.value;
  if (pane) following.value = pane.scrollHeight - pane.scrollTop - pane.clientHeight <= 48;
}
function scrollToLatest() {
  const pane = historyWindow.value;
  following.value = true;
  if (pane) pane.scrollTop = pane.scrollHeight;
}
function returnToLatest() {
  scrollToLatest();
  historyWindow.value?.focus({ preventScroll: true });
}
watch(
  [
    historyWindow,
    () => last.value?.id,
    () => last.value?.text,
    () => last.value?.result,
    () => last.value?.note,
  ],
  () => {
    if (following.value) scrollToLatest();
  },
  { flush: 'post' },
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
  const trimmed = question.trim();
  const submittedDraft = !replace && draft.value.trim() === trimmed ? draft.value : null;
  conversation.addTurn(trimmed, replace, identity);
  const history: AssistantExchange[] = [];
  if (target) {
    for (const turn of turns.value.slice(-9, -1).reverse()) {
      if (turn.recipient !== identity) break;
      if (turn.source !== 'ai' || !turn.result || !turn.text.trim()) continue;
      history.unshift({ user: turn.question, reply: turn.text.slice(0, 400).trim() });
      if (history.length === assistantHistoryLimit) break;
    }
  }
  const previousReply = history.at(-1)?.reply;
  const earlierReply = history.at(-2)?.reply;
  const olderHistory = history.slice(0, -2);
  const messages = target
    ? [...history.slice(-2).map((turn) => turn.user), trimmed]
    : turns.value.slice(-3).map((turn) => turn.question);
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
            ...(olderHistory.length ? { olderHistory } : {}),
          }
        : {},
    );
  } catch (error) {
    if (request === controller && last.value) {
      last.value.source = 'error';
      if (error instanceof AssistantRequestError && error.retryAfter) {
        const shared = ['ASSISTANT_LIMIT', 'MODEL_LIMIT', 'MODEL_BUDGET'].includes(error.code);
        const scope = shared ? 'ai' : (target?.id ?? mode);
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
      if (error instanceof AssistantRequestError && error.retryAfter) {
        const retryAt = new Date(Date.now() + error.retryAfter * 1000);
        last.value.note += ` 可在 ${retryAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} 后重试。`;
      }
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
  conversation.clear();
  textarea.value?.focus();
}
const quick = ['思绪停不下来', '白噪声有助睡眠吗？', '还不困，推荐个练习？'];
</script>

<template>
  <div class="content-page assistant-page">
    <header class="assistant-intro">
      <span class="assistant-symbol" aria-hidden="true"
        ><MoonStar :size="24" :stroke-width="1.4"
      /></span>
      <h1 tabindex="-1">睡前助手</h1>
      <p class="page-lead">今晚有想聊的事吗？小事也可以。</p>
    </header>
    <section class="assistant-panel" aria-labelledby="chat-title">
      <h2 id="chat-title" class="assistant-sr">聊天</h2>
      <div class="assistant-mode">
        <strong role="status">{{
          configured && consent ? providerName : checking ? '助手正在连接…' : '本地知识模式'
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
          隐私说明<ArrowUpRight :size="14" aria-hidden="true" />
        </button>
      </div>
      <div v-if="privacy" class="assistant-privacy">
        <p>
          消息通过 JHaven 服务处理。助手不会读取账户里的睡眠日记，请勿在输入框粘贴私人内容或凭据。
        </p>
        <p>聊天只留在当前标签页内存。刷新、清空对话或切换账号后清除。</p>
        <p v-if="providerName">
          开启 AI 模式后，本次输入和最多四轮同一供应商和模型已完成的 AI 对话可能发送给
          {{ providerName
          }}{{
            selectedProvider?.model ? `（${selectedProvider.model}）` : ''
          }}。留存适用其平台政策。<a
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
      <div v-if="configured">
        <p v-if="!consent" id="assistant-consent-scope" class="assistant-muted">
          开启后，本次消息和最多四轮在 {{ providerName }} 的当前模型已完成的对话会发给
          {{ providerName }}。日记不会自动发送。随时可关闭，继续用本地知识。
        </p>
        <label class="assistant-consent">
          <input
            v-model="consent"
            type="checkbox"
            :aria-describedby="consent ? undefined : 'assistant-consent-scope'"
          />
          使用 {{ providerName }} 聊天
        </label>
      </div>
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
      <div v-else class="assistant-history">
        <div
          ref="historyWindow"
          class="assistant-history-window"
          role="region"
          aria-label="完整对话"
          tabindex="0"
          @scroll.passive="readScrollPosition"
        >
          <ol class="assistant-thread">
            <li v-for="(turn, index) in turns" :key="turn.id" class="assistant-turn">
              <p class="assistant-question">{{ turn.question }}</p>
              <div class="assistant-reply">
                <p v-if="turn.source && turn.source !== 'ai'" class="assistant-reply-mode">
                  {{ sourceLabels[turn.source] }}
                </p>
                <p v-if="turn.text" class="assistant-text">{{ turn.text }}</p>
                <p v-if="turn.note" class="assistant-muted" role="status">{{ turn.note }}</p>
                <p v-if="!turn.text && !turn.note" class="assistant-muted">正在回复…</p>
                <span v-if="turn.source === 'ai' && turn.recipient" class="assistant-sr">
                  由 {{ turn.recipient }} 回复。
                </span>
                <details v-if="turn.result?.sources.length" class="assistant-references">
                  <summary>参考资料</summary>
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
        </div>
        <button
          v-if="!following"
          class="button button-secondary assistant-return-latest"
          type="button"
          @click="returnToLatest"
        >
          回到底部
        </button>
      </div>
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
            class="button button-secondary"
            type="button"
            @click="send(last.question, true, $event)"
            :disabled="retryBlocked"
          >
            {{ last.note ? '重试回复' : '重新生成' }}
          </button>
          <button
            v-if="last && consent && (last.note || active)"
            class="button button-secondary"
            type="button"
            @click="useLocalKnowledge"
          >
            改用本地知识
          </button>
          <button
            v-if="turns.length"
            class="button button-secondary"
            type="button"
            @click="clearChat"
          >
            清空对话
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
