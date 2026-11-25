import { onScopeDispose, ref, watch } from 'vue';
import { z } from 'zod';
import {
  chatDetail,
  chatSettings,
  chatSummary,
  chatTurn,
  type ChatFilter,
  type ChatSummary,
} from '@jhaven/shared';
import { spaceRequest, SpaceError } from '../lib/space';
import { useAssistantStore } from '../stores/assistant';
import { useAuthStore } from '../stores/auth';
import { forgetChatViews } from '../domain/pageRecovery';

export function useChatHistory() {
  const auth = useAuthStore();
  const chat = useAssistantStore();
  const state = ref<z.infer<typeof chatSettings>>();
  const rows = ref<ChatSummary[]>([]);
  const busy = ref(false);
  const error = ref('');
  const notice = ref('');
  let active: AbortController | undefined;
  let pendingAutoSave = false;
  function reset() {
    active?.abort();
    active = undefined;
    pendingAutoSave = false;
    state.value = undefined;
    rows.value = [];
    error.value = notice.value = '';
    busy.value = false;
  }
  onScopeDispose(reset);

  type Request = (path?: string, method?: string, body?: unknown) => Promise<unknown>;
  async function run<T>(action: (fetch: Request) => Promise<T>) {
    const id = auth.user?.id;
    if (!id || active) return;
    const controller = new AbortController();
    active = controller;
    busy.value = true;
    error.value = notice.value = '';
    try {
      return await action(async (path = '', method = 'GET', body) => {
        const result = await spaceRequest(id, '/chat' + path, method, body, controller.signal);
        if (controller.signal.aborted || id !== auth.user?.id)
          throw new DOMException('已取消', 'AbortError');
        return result;
      });
    } catch (issue) {
      if (active === controller) {
        if (issue instanceof SpaceError && issue.code === 'AUTO_SAVE_DISABLED' && state.value)
          state.value.autoSave = false;
        error.value =
          issue instanceof SpaceError ? issue.message : '聊天历史暂不可用，当前对话仍保留在页面。';
      }
    } finally {
      if (active === controller) {
        active = undefined;
        busy.value = false;
        if (pendingAutoSave) {
          pendingAutoSave = false;
          if (state.value?.autoSave) void save(true);
        }
      }
    }
  }
  async function readSettings(request: Request) {
    state.value = chatSettings.parse(await request('/settings'));
    return state.value;
  }
  watch(
    () => auth.user?.id,
    (id) => {
      reset();
      if (id) void run(readSettings);
    },
    { immediate: true, flush: 'sync' },
  );
  const list = (search: string, filter: ChatFilter) =>
    run(async (request) => {
      await readSettings(request);
      rows.value = z.array(chatSummary).parse(await request('/search', 'POST', { search, filter }));
    });
  function save(automatic = false) {
    if (automatic && !state.value?.autoSave) return;
    if (automatic && busy.value) {
      pendingAutoSave = true;
      return;
    }
    return run(async (request) => {
      const projected = chat.turns.map(
        ({ question, sentOn, text, source, result, recipient, note }) => ({
          question,
          sentOn,
          text,
          source,
          result,
          recipient,
          note,
        }),
      );
      const snapshot = z.array(chatTurn).min(1).max(500).safeParse(projected);
      if (!snapshot.success) {
        error.value = '只能保存已结束且不超过 500 轮的对话，当前内容仍保留在页面。';
        return;
      }
      const settings = state.value ?? (await readSettings(request));
      const entry = chat.saved ?? { id: crypto.randomUUID(), revision: 0 };
      chat.saved = entry;
      const lastTurnId = chat.turns.at(-1)?.id;
      const saved = chatDetail.parse(
        await request('/' + entry.id, 'PUT', {
          revision: entry.revision,
          epoch: settings.epoch,
          automatic,
          turns: snapshot.data,
        }),
      );
      chat.saved = { id: saved.id, revision: saved.revision, lastTurnId };
      notice.value = automatic ? '已自动保存。' : '对话已保存。';
    });
  }
  return {
    state,
    rows,
    busy,
    error,
    notice,
    list,
    save,
    open: (id: string) => run(async (request) => chatDetail.parse(await request('/' + id))),
    autoSave: (autoSave: boolean) =>
      run(async (request) => {
        state.value = chatSettings.parse(await request('/settings', 'PUT', { autoSave }));
        notice.value = autoSave ? '自动保存已开启。' : '自动保存已关闭，已有历史保留。';
      }),
    rename: (id: string, title: string) =>
      run(async (request) => {
        const updated = chatSummary.parse(await request('/' + id, 'PATCH', { title }));
        rows.value = rows.value.map((row) => (row.id === id ? updated : row));
        return true;
      }),
    remove: (id: string) =>
      run(async (request) => {
        await request('/' + id, 'DELETE', {});
        rows.value = rows.value.filter((row) => row.id !== id);
        if (auth.user) forgetChatViews(auth.user.id, id);
        if (chat.saved?.id === id) chat.clear();
        return true;
      }),
    clear: () =>
      run(async (request) => {
        state.value = chatSettings.parse(await request('', 'DELETE', {}));
        rows.value = [];
        if (auth.user) forgetChatViews(auth.user.id);
        if (chat.saved) chat.clear();
        return true;
      }),
  };
}
