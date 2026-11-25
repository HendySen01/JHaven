import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { AssistantMode, AssistantProviderId, ChatTurn } from '@jhaven/shared';
import { useAuthStore } from './auth';

type Turn = Omit<ChatTurn, 'source'> & {
  id: number;
  source?: ChatTurn['source'];
};
export type AssistantBlockScope = AssistantMode | AssistantProviderId;
export type AssistantBlock = { code: string; until?: number; reservation?: number };

export const useAssistantStore = defineStore('assistant', () => {
  const auth = useAuthStore();
  const turns = ref<Turn[]>([]);
  const draft = ref('');
  const saved = ref<{ id: string; revision: number; lastTurnId?: number | undefined }>();
  const blocks = ref<Partial<Record<AssistantBlockScope, AssistantBlock>>>({});
  let nextId = 0;

  function addTurn(question: string, replace: boolean, recipient?: string) {
    const now = new Date();
    const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
      .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
      .join('-');
    const original = replace ? turns.value.at(-1) : undefined;
    const sentOn = original?.question === question ? original.sentOn : date;
    const turn = { id: ++nextId, question, sentOn, text: '', ...(recipient ? { recipient } : {}) };
    if (replace && turns.value.length) turns.value.splice(-1, 1, turn);
    else turns.value.push(turn);
    return turn;
  }

  function clear() {
    turns.value = [];
    draft.value = '';
    saved.value = undefined;
  }
  function open(id: string, revision: number, history: ChatTurn[]) {
    clear();
    turns.value = history.map((turn) => ({ ...turn, id: ++nextId }));
    saved.value = { id, revision, lastTurnId: turns.value.at(-1)?.id };
  }

  watch(
    () => auth.user?.id,
    () => {
      clear();
      if (blocks.value.ai?.code === 'ASSISTANT_LIMIT') delete blocks.value.ai;
    },
    { flush: 'sync' },
  );
  return { turns, draft, saved, blocks, addTurn, clear, open };
});
