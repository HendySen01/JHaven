<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { MoonStar, ArrowUpRight } from '@lucide/vue';
import {
  assistantAction,
  assistantStatus,
  type AssistantAction,
  type AssistantEvent,
} from '@jhaven/shared';
import { useRouter } from 'vue-router';
import { findScene } from '../domain/evening';
import { practices } from '../domain/relaxation';
import { useEveningStore } from '../stores/evening';
import { useAuthStore } from '../stores/auth';
import { readAssistant } from '../lib/assistant';

type Result = Extract<AssistantEvent, { type: 'done' }>;
type Turn = {
  question: string;
  text: string;
  mode?: 'local' | 'model';
  result?: Result;
  note?: string;
};
const router = useRouter();
const evening = useEveningStore();
const auth = useAuthStore();
const draft = ref('');
const turns = ref<Turn[]>([]);
const active = ref(false);
const consent = ref(false);
const configured = ref(false);
const providerName = ref('OpenAI');
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
    const provider = assistantStatus.parse(await res.json()).provider;
    configured.value = provider !== null;
    providerName.value = provider === 'deepseek' ? 'DeepSeek' : 'OpenAI';
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
}
watch(() => auth.user?.id, reset);
onBeforeUnmount(() => {
  statusController.abort();
  stop();
});
watch(consent, (value) => {
  if (!value && active.value) stop('已停止本次请求，后续将使用本地知识。');
});
async function send(question: string, replace = false, localOnly = false, event?: Event) {
  if (active.value || !question.trim()) return;
  const control =
    event instanceof SubmitEvent && event.submitter ? event.submitter : event?.currentTarget;
  const moveFocus = control === document.activeElement;
  pending.value = null;
  const current: Turn = { question: question.trim(), text: '' };
  turns.value = [...(replace ? turns.value.slice(0, -1) : turns.value).slice(-3), current];
  const messages = turns.value.slice(-3).map((turn) => turn.question);
  const controller = new AbortController();
  request = controller;
  active.value = true;
  if (!replace && draft.value.trim() === current.question) draft.value = '';
  if (moveFocus) void nextTick(() => stopButton.value?.focus({ preventScroll: true }));
  try {
    await readAssistant(
      messages,
      configured.value && consent.value && !localOnly,
      AbortSignal.any([controller.signal, AbortSignal.timeout(16_000)]),
      (event) => {
        if (request !== controller || !last.value) return;
        if (event.type === 'start') last.value.mode = event.mode;
        if (event.type === 'text') last.value.text += event.text;
        if (event.type === 'done') last.value.result = event;
      },
    );
  } catch (error) {
    if (request === controller && last.value)
      last.value.note =
        error instanceof DOMException && error.name === 'TimeoutError'
          ? '这次回复超过等待时间，可以重试或使用本地知识。'
          : error instanceof TypeError
            ? '网络连接中断，可以重试。'
            : error instanceof Error && error.name !== 'ZodError' && !(error instanceof SyntaxError)
              ? error.message
              : '回复格式异常，可以重试。';
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
      <p class="page-lead">今晚需要什么？可以说一句，也可以让对话停在这里。</p>
    </header>
    <section class="assistant-panel" aria-labelledby="chat-title">
      <h2 id="chat-title" class="assistant-sr">聊天</h2>
      <div class="assistant-mode">
        <strong role="status">{{
          configured && consent ? 'AI 模式' : checking ? '正在检查助手服务…' : '本地知识模式'
        }}</strong>
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
          消息通过 JHaven 服务处理。开启 AI 模式后，本次输入可能发送给
          {{ providerName }}；请勿粘贴私人日记或凭据。助手不会读取账户里的睡眠日记。
        </p>
        <p>本站不长期保存聊天。离开页面或清空对话会清除浏览器内存记录。</p>
        <p>
          第三方对已发送内容的留存适用其平台政策。<a
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
        <input v-model="consent" type="checkbox" /> 可将本次输入发送给 {{ providerName }}，启用 AI
        措辞
      </label>
      <ul v-if="!turns.length" class="assistant-quick">
        <li v-for="question in quick" :key="question">
          <button
            class="button button-secondary"
            type="button"
            @click="send(question, false, false, $event)"
          >
            {{ question }}
          </button>
        </li>
      </ul>
      <ol v-else class="assistant-thread" aria-label="近期对话">
        <li v-for="(turn, index) in turns" :key="index" class="assistant-turn">
          <p class="assistant-question">{{ turn.question }}</p>
          <div class="assistant-reply">
            <p v-if="turn.mode" class="assistant-reply-mode">
              {{ turn.mode === 'model' ? 'AI 辅助回答' : '本地知识' }}
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
      <form class="assistant-compose" @submit.prevent="send(draft, false, false, $event)">
        <label for="assistant-message">今晚想聊什么</label>
        <textarea
          id="assistant-message"
          ref="textarea"
          v-model="draft"
          rows="2"
          maxlength="400"
          placeholder="例如，我想安静地待一会儿。"
        />
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
          <button v-else class="button button-primary" type="submit" :disabled="!draft.trim()">
            发送
          </button>
          <button
            v-if="last && !active"
            class="quiet-link"
            type="button"
            @click="send(last.question, true, false, $event)"
          >
            {{ last.note ? '重试回复' : '重新生成' }}
          </button>
          <button
            v-if="last?.note && consent && !active"
            class="quiet-link"
            type="button"
            @click="send(last.question, true, true, $event)"
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
