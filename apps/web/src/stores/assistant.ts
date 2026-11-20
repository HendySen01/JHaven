import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { AssistantEvent } from '@jhaven/shared';
import { useAuthStore } from './auth';

type Reply = Extract<AssistantEvent, { type: 'done' }>;
type Turn = {
  id: number;
  question: string;
  text: string;
  source?: 'ai' | 'local' | 'fallback' | 'error';
  result?: Reply;
  recipient?: string;
  note?: string;
};

export const useAssistantStore = defineStore('assistant', () => {
  const auth = useAuthStore();
  const turns = ref<Turn[]>([]);
  const draft = ref('');
  let nextId = 0;

  function addTurn(question: string, replace: boolean, recipient?: string) {
    const turn = { id: ++nextId, question, text: '', ...(recipient ? { recipient } : {}) };
    if (replace && turns.value.length) turns.value.splice(-1, 1, turn);
    else turns.value.push(turn);
  }

  function clear() {
    turns.value = [];
    draft.value = '';
  }

  watch(() => auth.user?.id, clear, { flush: 'sync' });
  return { turns, draft, addTurn, clear };
});
