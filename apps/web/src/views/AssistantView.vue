<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { MoonStar, ArrowUpRight } from '@lucide/vue';
import {
  assistantAction,
  assistantExchangeBytes,
  assistantHistoryBytes,
  assistantHistoryLimit,
  assistantPrefersChat,
  assistantRecentHistory,
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
import { useAssistantStore, type AssistantBlockScope } from '../stores/assistant';
import {
  AssistantRequestError,
  assistantErrors,
  checkAssistantAvailability,
  readAssistant,
} from '../lib/assistant';
import { withRequestDeadline } from '../lib/requestDeadline';
import { useChatHistory } from '../composables/useChatHistory';
import ChatHistoryPanel from '../components/ChatHistoryPanel.vue';

const router = useRouter();
const evening = useEveningStore();
const auth = useAuthStore();
const conversation = useAssistantStore();
const { turns, draft, blocks } = storeToRefs(conversation);
const composing = ref(false);
let compositionEndedAt = -Infinity;
const active = ref(false);
const history = useChatHistory();
const historyOpen = ref(false);
const { busy: historyBusy, error: historyError, notice: historyNotice } = history;
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
const blockScope = computed<AssistantBlockScope | undefined>(() => {
  const mode = assistantMode.value;
  if (blocks.value[mode]) return mode;
  if (mode === 'ai' && recipient.value && blocks.value[recipient.value]) return recipient.value;
  return undefined;
});
const composerBlock = computed(() =>
  blockScope.value ? blocks.value[blockScope.value] : undefined,
);
const retryBlocked = computed(() => !!composerBlock.value);
const recoveryTime = computed(() => {
  const until = composerBlock.value?.until;
  return until
    ? new Date(until).toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : undefined;
});
const polledCodes = ['MODEL_BUDGET', 'MODEL_PROVIDER_BUDGET', 'MODEL_CONCURRENCY'];
const globalCodes = ['ASSISTANT_LIMIT', 'ASSISTANT_IP_LIMIT', 'MODEL_LIMIT', 'MODEL_BUDGET'];
const pausedCodes = [
  ...polledCodes,
  ...globalCodes,
  'MODEL_PROVIDER_LIMIT',
  'LOCAL_MODE_LIMIT',
  'upstream_rate',
  'proxy_rate',
  'authentication',
  'balance',
  'model_unavailable',
];
function pauseSending(
  error: AssistantRequestError,
  mode: AssistantMode,
  provider?: AssistantProviderId,
) {
  if (error.retryAfter === 0 || (!pausedCodes.includes(error.code) && !error.retryAfter))
    return false;
  const scope =
    mode === 'local' ? mode : globalCodes.includes(error.code) ? 'ai' : (provider ?? 'ai');
  blocks.value[scope] = {
    code: error.code,
    ...(error.retryAfter ? { until: Date.now() + error.retryAfter * 1000 } : {}),
    ...(polledCodes.includes(error.code) && error.reservation
      ? { reservation: error.reservation }
      : {}),
  };
  return true;
}
function resumeSending() {
  if (blockScope.value) delete blocks.value[blockScope.value];
}
watch(
  [blockScope, composerBlock, selectedProvider],
  ([scope, block, target], _old, onCleanup) => {
    if (!scope || !block) return;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    onCleanup(() => {
      clearTimeout(timer);
      controller.abort();
    });
    if (block.until !== undefined) {
      const wait = () => {
        const remaining = block.until! - Date.now();
        if (remaining <= 0) delete blocks.value[scope];
        else timer = setTimeout(wait, Math.min(remaining, 86_400_000));
      };
      wait();
      return;
    }
    if (!block.reservation || !target) return;
    const reservation = block.reservation;
    const check = async () => {
      try {
        const status = await withRequestDeadline(
          4000,
          (signal) => checkAssistantAvailability(target.id, target.model, reservation, signal),
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (status.available) {
          delete blocks.value[scope];
          return;
        }
        if (status.code !== block.code || status.retryAfter) {
          delete blocks.value[scope];
          pauseSending(
            new AssistantRequestError(status.code, status.retryAfter, reservation),
            'ai',
            target.id,
          );
          return;
        }
      } catch {
        // 查询失败时留在暂停状态，后续只重查站内状态。
      }
      if (!controller.signal.aborted) timer = setTimeout(check, 5000);
    };
    timer = setTimeout(check, 5000);
  },
  { immediate: true },
);
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
    const status = await withRequestDeadline(
      4000,
      async (signal) => {
        const res = await fetch('/api/assistant/status', {
          cache: 'no-store',
          credentials: 'omit',
          signal,
        });
        if (!res.ok) throw new Error('无法检查助手服务。');
        return assistantStatus.parse(await res.json());
      },
      statusController.signal,
    );
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
  if (last.value) {
    last.value.note = note;
    last.value.source = 'error';
  }
}
function restoreComposerFocus() {
  if (document.activeElement === stopButton.value) textarea.value?.focus({ preventScroll: true });
}
function reset() {
  stop();
  pending.value = null;
  consent.value = false;
  following.value = true;
}
watch(
  () => auth.user?.id,
  () => {
    historyOpen.value = false;
    reset();
  },
  { flush: 'sync' },
);
watch(active, (generating, wasGenerating) => {
  if (!generating && wasGenerating && turns.value.length) void history.save(true);
});
onBeforeUnmount(() => {
  statusController.abort();
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
  assistantMode.value = 'local';
  textarea.value?.focus({ preventScroll: true });
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
  const { sentOn: latestSentOn } = conversation.addTurn(trimmed, replace, identity);
  const history: AssistantExchange[] = [];
  let prefersChat = assistantPrefersChat(trimmed);
  if (target) {
    const candidates: AssistantExchange[] = [];
    for (let index = turns.value.length - 2; index >= 0; index--) {
      const turn = turns.value[index]!;
      if (turn.recipient !== identity) break;
      if (!prefersChat) prefersChat = assistantPrefersChat(turn.question);
      if (prefersChat && turns.value.length - 2 - index >= 16) break;
      if (turns.value.length - 2 - index >= 16) continue;
      if (turn.source !== 'ai' || !turn.result || !turn.text.trim()) continue;
      const reply = turn.text
        .slice(0, 400)
        .replace(/[\uD800-\uDBFF]$/, '')
        .trim();
      candidates.push({ user: turn.question, reply, sentOn: turn.sentOn });
    }
    const topics =
      trimmed
        .normalize('NFKC')
        .toLowerCase()
        .match(/[\p{Script=Han}]+|[a-z\d]+/gu) ?? [];
    const terms = new Set(
      topics.flatMap((topic) =>
        /^[a-z\d]/.test(topic)
          ? topic.length > 2
            ? [topic]
            : []
          : Array.from({ length: Math.max(0, topic.length - 1) }, (_, index) =>
              topic.slice(index, index + 2),
            ),
      ),
    );
    const relevant = candidates
      .slice(assistantRecentHistory)
      .map((turn, index) => {
        const source = turn.user.normalize('NFKC').toLowerCase();
        return {
          index: index + assistantRecentHistory,
          score: [...terms].filter((term) => source.includes(term)).length,
        };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);
    let bytes = assistantHistoryBytes;
    const selected: number[] = [];
    const order = [
      ...candidates.slice(0, assistantRecentHistory).keys(),
      ...relevant.map(({ index }) => index),
    ];
    for (const index of order) {
      const turn = candidates[index]!;
      if (selected.length === assistantHistoryLimit) break;
      const size = assistantExchangeBytes(turn);
      if (size > bytes) continue;
      bytes -= size;
      selected.push(index);
    }
    history.push(...selected.sort((a, b) => b - a).map((index) => candidates[index]!));
  }
  const previous = history.at(-1);
  const earlier = history.at(-2);
  const olderHistory = history.slice(0, -2);
  const messages = target
    ? [...history.slice(-2).map((turn) => turn.user), trimmed]
    : turns.value.slice(-3).map((turn) => turn.question);
  const controller = new AbortController();
  request = controller;
  active.value = true;
  if (moveFocus) void nextTick(() => stopButton.value?.focus({ preventScroll: true }));
  let inputRestricted = false;
  try {
    await withRequestDeadline(
      30_000,
      (signal) =>
        readAssistant(
          messages,
          mode,
          signal,
          (event) => {
            if (request !== controller || !last.value) return;
            if (event.type === 'start') {
              inputRestricted = event.inputRestricted === true;
              last.value.source = event.source ?? (event.mode === 'model' ? 'ai' : 'local');
              switch (event.fallbackCode) {
                case 'provider_invalid_output':
                  last.value.note = '模型返回格式异常。';
                  break;
                case 'invalid_structure':
                  last.value.note = '模型回复缺少可用内容。';
                  break;
                case 'output_rejected':
                  last.value.note = '模型回复未通过检查。';
                  break;
              }
            }
            if (event.type === 'text') last.value.text += event.text;
            if (event.type === 'done') {
              last.value.result = event;
              if (event.source) last.value.source = event.source;
              if (
                last.value.source !== 'fallback' &&
                !inputRestricted &&
                submittedDraft !== null &&
                draft.value === submittedDraft
              )
                draft.value = '';
            }
          },
          target
            ? {
                provider: target.id,
                ...(target.model ? { model: target.model } : {}),
                latestSentOn,
                ...(previous ? { previousReply: previous.reply } : {}),
                ...(previous?.sentOn ? { previousSentOn: previous.sentOn } : {}),
                ...(earlier ? { earlierReply: earlier.reply } : {}),
                ...(earlier?.sentOn ? { earlierSentOn: earlier.sentOn } : {}),
                ...(olderHistory.length ? { olderHistory } : {}),
                ...(prefersChat ? { prefersChat } : {}),
              }
            : {},
        ),
      controller.signal,
    );
  } catch (error) {
    if (request === controller && last.value) {
      last.value.source = 'error';
      const paused =
        error instanceof AssistantRequestError && pauseSending(error, mode, target?.id);
      last.value.note = paused
        ? '这条消息暂未得到回复。'
        : error instanceof DOMException && error.name === 'TimeoutError'
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
  if (historyBusy.value) return;
  reset();
  conversation.clear();
  textarea.value?.focus();
}
function canLeaveChat() {
  const unsaved = draft.value.trim() || turns.value.at(-1)?.id !== conversation.saved?.lastTurnId;
  return !unsaved || window.confirm('当前对话还有未保存的内容。仍要离开这段对话吗？');
}
function newChat() {
  if (canLeaveChat()) clearChat();
}
async function openChat(id: string) {
  if (!canLeaveChat()) return;
  const saved = await history.open(id);
  if (!saved || active.value) return;
  reset();
  conversation.open(saved.id, saved.revision, saved.turns);
  historyOpen.value = false;
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
      <div class="chat-history-actions">
        <button
          class="button button-secondary"
          type="button"
          :disabled="active || historyBusy"
          @click="historyOpen = true"
        >
          历史记录
        </button>
        <button
          class="button button-secondary"
          type="button"
          :disabled="active || historyBusy"
          @click="newChat"
        >
          新建对话
        </button>
        <button
          class="button button-secondary"
          type="button"
          :disabled="active || historyBusy || !turns.length"
          @click="auth.signedIn ? history.save() : (historyOpen = true)"
        >
          保存对话
        </button>
      </div>
      <p v-if="historyNotice" class="assistant-muted" role="status">{{ historyNotice }}</p>
      <p v-if="historyError && !historyOpen" class="assistant-muted" role="alert">
        {{ historyError }}
      </p>
      <ChatHistoryPanel
        v-if="historyOpen"
        :signed-in="auth.signedIn"
        :history="history"
        @close="historyOpen = false"
        @open="openChat"
      />
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
        <p>
          未保存的聊天只留在当前标签页。登录后手动保存，或主动开启默认关闭的自动保存，才会将对话存入
          JHaven 账户数据库。可在历史记录中单独删除或清空全部。关闭自动保存会保留既有记录。
        </p>
        <p v-if="providerName">
          开启 AI 模式后，本次输入和最多六轮同一供应商和模型已完成的 AI
          对话（含各条发送日期）可能发送给
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
          >。若你明确表示只想闲聊，模型也会收到这一偏好。较早的原话不会因此发送。
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
          开启后，本次消息和最多六轮在
          {{ providerName }} 的当前模型已完成的对话（含各条发送日期）会发给
          {{
            providerName
          }}。你明确表达的闲聊偏好也会带上，日记不会自动发送。随时可关闭，继续用本地知识。
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
          :placeholder="
            assistantMode === 'local'
              ? '问问已审核的睡眠知识，或找个声音与练习。'
              : '随便聊聊，或者说说今天发生的事。'
          "
          :aria-describedby="
            composerBlock
              ? 'assistant-composer-hint assistant-composer-status'
              : 'assistant-composer-hint'
          "
          @keydown="handleComposerKeydown"
          @compositionstart="composing = true"
          @compositionend="
            composing = false;
            compositionEndedAt = $event.timeStamp;
          "
        />
        <div v-if="composerBlock" class="assistant-compose-notice">
          <p id="assistant-composer-status" role="status">
            {{ assistantErrors[composerBlock.code] ?? '发送暂时暂停。' }}
            <span v-if="recoveryTime"> {{ recoveryTime }} 后可以再试。</span>
            <span v-else-if="composerBlock.reservation"> 站内额度可用后，发送按钮会自动恢复。</span>
            <span v-else> 服务未给出恢复时间。</span>
            <span v-if="draft.trim()"> 草稿还在，可以继续编辑或复制。</span>
          </p>
          <button
            v-if="!recoveryTime && !composerBlock.reservation"
            class="quiet-link"
            type="button"
            @click="resumeSending"
          >
            允许再次尝试
          </button>
        </div>
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
            v-if="consent && (composerBlock || last?.note || active)"
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
            :disabled="historyBusy"
            @click="clearChat"
          >
            清空对话
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
