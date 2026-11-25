import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import { isPageScrollPending, PAGE_LEAVING, PAGE_RECOVERED } from '../router/pageRecovery';
import {
  AUDIO_LIBRARY_VIEW_PREFIX,
  chooseAudioViewAnchor,
  parseAudioLibraryView,
  type AudioLibraryCategory,
  type AudioLibraryView,
} from '../domain/audioLibraryView';

// 仅记录声音页面的浏览位置与筛选；不记录聊天、账号或其他私人内容。
export function useAudioLibraryView() {
  const route = useRoute();
  const root = ref<HTMLElement | null>(null);
  let path = route.path;
  function read() {
    try {
      return parseAudioLibraryView(localStorage.getItem(AUDIO_LIBRARY_VIEW_PREFIX + path));
    } catch {
      return null;
    }
  }
  const initial = read();
  const query = ref(initial?.query ?? '');
  const category: Ref<AudioLibraryCategory> = ref(initial?.category ?? 'all');
  let mounted = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let lastWritten = initial ? JSON.stringify(initial) : '';

  function scroller(): HTMLElement | null {
    for (let node = root.value?.parentElement; node; node = node.parentElement) {
      if (node === document.body || node === document.documentElement) break;
      if (
        /^(auto|scroll|overlay)$/.test(getComputedStyle(node).overflowY) &&
        node.scrollHeight > node.clientHeight + 1
      )
        return node;
    }
    return null;
  }
  function geometry() {
    const node = scroller();
    return {
      node,
      top: node?.getBoundingClientRect().top ?? 0,
      height: node?.clientHeight ?? window.innerHeight,
      scrollTop: Math.max(0, node?.scrollTop ?? window.scrollY),
      maxScrollTop: Math.max(
        0,
        node
          ? node.scrollHeight - node.clientHeight
          : (document.scrollingElement?.scrollHeight ?? document.documentElement.scrollHeight) -
              window.innerHeight,
      ),
    };
  }
  function anchors() {
    return Array.from(root.value?.querySelectorAll<HTMLElement>('[data-audio-view-anchor]') ?? []);
  }
  function capture(): AudioLibraryView {
    const g = geometry();
    const anchor =
      g.scrollTop > 0
        ? chooseAudioViewAnchor(
            anchors().map((node) => {
              const bounds = node.getBoundingClientRect();
              return {
                id: node.dataset.audioViewAnchor!,
                top: bounds.top - g.top,
                bottom: bounds.bottom - g.top,
              };
            }),
            g.height,
          )
        : null;
    return {
      version: 1,
      category: category.value,
      query: query.value,
      scrollTop: Math.round(g.scrollTop),
      anchor: anchor?.id ?? null,
      anchorOffset: Math.round(anchor?.top ?? 0),
    };
  }
  function save() {
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    saveTimer = undefined;
    if (!mounted || isPageScrollPending() || !root.value || route.path !== path) return;
    try {
      const serialized = JSON.stringify(capture());
      if (serialized !== lastWritten) {
        localStorage.setItem(AUDIO_LIBRARY_VIEW_PREFIX + path, serialized);
        lastWritten = serialized;
      }
    } catch {
      // 私密浏览或禁用存储时，正常浏览和播放仍可使用。
    }
  }
  function queueSave() {
    if (!mounted || isPageScrollPending() || saveTimer !== undefined) return;
    // 仅用于筛选和布局更新；真实滚动直接保存。
    saveTimer = setTimeout(save, 120);
  }
  function recordScroll(event: Event) {
    const target = event.target;
    if (
      target === document ||
      target === window ||
      target === document.scrollingElement ||
      target === scroller()
    )
      save();
  }
  function visibility() {
    if (document.visibilityState === 'hidden') save();
  }
  onMounted(() => {
    mounted = true;
    document.addEventListener('scroll', recordScroll, { capture: true, passive: true });
    window.addEventListener('scroll', recordScroll, { passive: true });
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener(PAGE_LEAVING, save);
    window.addEventListener(PAGE_RECOVERED, queueSave);
    // 路由只在进入时恢复一次；此处只记录最新位置和筛选，不主动滚动。
    queueSave();
  });
  watch([query, category], queueSave, { flush: 'post' });
  watch(
    () => route.path,
    (value) => {
      if (value === path) return;
      path = value;
      const saved = read();
      lastWritten = saved ? JSON.stringify(saved) : '';
      query.value = saved?.query ?? '';
      category.value = saved?.category ?? 'all';
      // 路由恢复读取对应路径的锚点，筛选先于位置恢复。
      queueSave();
    },
  );
  onBeforeUnmount(() => {
    save();
    mounted = false;
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    document.removeEventListener('scroll', recordScroll, true);
    window.removeEventListener('scroll', recordScroll);
    window.removeEventListener('pagehide', save);
    window.removeEventListener(PAGE_LEAVING, save);
    window.removeEventListener(PAGE_RECOVERED, queueSave);
    document.removeEventListener('visibilitychange', visibility);
  });
  return { root, query, category };
}
