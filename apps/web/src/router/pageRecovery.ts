import { nextTick, watch } from 'vue';
import type { RouteLocationNormalized, Router } from 'vue-router';
import type { useAuthStore } from '../stores/auth';
import {
  AUDIO_LIBRARY_VIEW_PREFIX,
  parseAudioLibraryView,
  chooseAudioViewAnchor,
} from '../domain/audioLibraryView';
import {
  clearOtherPrivateViews,
  isAudioPage,
  isPrivatePage,
  pageViewKey,
  parsePagePosition,
  readView,
  scrollTarget,
  writeView,
  type PagePosition,
} from '../domain/pageRecovery';

export const PAGE_LEAVING = 'jhaven:page-leaving';
export const PAGE_RECOVERED = 'jhaven:page-recovered';
let pending = false;
export const isPageScrollPending = () => pending;
let generation = 0;
let router: Router;
let auth: ReturnType<typeof useAuthStore>;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let activePath = '';
let pendingDestination = '';
let lastWritten = '';
let cancelLayout: (() => void) | undefined;

function identity() {
  return auth.initialized ? (auth.user?.id ?? null) : undefined;
}
function main() {
  return document.getElementById('main-content');
}
function anchors() {
  return Array.from(
    main()?.querySelectorAll<HTMLElement>(
      '[data-page-anchor], section[id], h1[id], h2[id], legend[id]',
    ) ?? [],
  )
    .map((node) => ({ node, id: node.dataset.pageAnchor || node.id }))
    .filter(
      ({ id, node }) => /^[a-z0-9:_-]{1,100}$/i.test(id) && node.getBoundingClientRect().height > 2,
    );
}
function position(): PagePosition {
  const top = Math.max(0, Math.round(window.scrollY));
  const items = anchors().map(({ node, id }) => {
    const rect = node.getBoundingClientRect();
    return { id, top: rect.top, bottom: rect.bottom };
  });
  const anchor = top > 0 ? chooseAudioViewAnchor(items, window.innerHeight) : null;
  const inner = main()?.querySelector<HTMLElement>('[data-page-scroll-pane]');
  return {
    top,
    anchor: anchor?.id ?? null,
    offset: Math.round(anchor?.top ?? 0),
    ...(inner ? { inner: Math.max(0, Math.round(inner.scrollTop)) } : {}),
  };
}
function save() {
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = undefined;
  if (pending || !activePath || router.currentRoute.value.path !== activePath) return;
  const key = pageViewKey(activePath, identity());
  if (!key || !main()) return;
  const value = position();
  const serialized = key + JSON.stringify(value);
  if (serialized === lastWritten) return;
  writeView(key, value);
  lastWritten = serialized;
}
function queueSave() {
  if (!pending && saveTimer === undefined) saveTimer = setTimeout(save, 120);
}
function complete() {
  pending = false;
  pendingDestination = '';
  activePath = router.currentRoute.value.path;
  lastWritten = '';
  window.dispatchEvent(new Event(PAGE_RECOVERED));
  queueSave();
}
function cancel() {
  generation++;
  cancelLayout?.();
  cancelLayout = undefined;
  if (pending) complete();
}
function userInteraction() {
  // 导航已提交但 scrollBehavior 还没开始时，用户手势也必须优先。
  if (pending && router.currentRoute.value.fullPath === pendingDestination) {
    cancel();
  }
}
function recordScroll(event: Event) {
  // 只记录文档和显式声明的页面滚动区；聊天与弹窗各自独立记录。
  const target = event.target;
  if (
    target === document ||
    target === window ||
    target === document.scrollingElement ||
    (target instanceof HTMLElement && target.matches('[data-page-scroll-pane]'))
  )
    save();
}
function waitForLayout(token: number, waitForData: boolean): Promise<void> {
  return new Promise((resolve) => {
    let frame = 0;
    let observer: MutationObserver | undefined;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      observer?.disconnect();
      clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
      if (cancelLayout === finish) cancelLayout = undefined;
      resolve();
    };
    const check = () => {
      if (finished || token !== generation) return finish();
      if (waitForData && main()?.querySelector('[data-page-recovery-loading="true"]')) return;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (waitForData && main()?.querySelector('[data-page-recovery-loading="true"]')) return;
          finish();
        });
      });
    };
    const timer = setTimeout(finish, waitForData ? 12_000 : 400);
    cancelLayout = finish;
    if (main()) {
      observer = new MutationObserver(check);
      observer.observe(main()!, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-page-recovery-loading'],
      });
    }
    check();
  });
}
function setTop(top: number) {
  const node = document.scrollingElement as HTMLElement | null;
  if (!node) {
    window.scrollTo(0, top);
    return;
  }
  const previous = node.style.scrollBehavior;
  node.style.scrollBehavior = 'auto';
  window.scrollTo(0, top);
  node.style.scrollBehavior = previous;
}
function restorePosition(saved: PagePosition, audio: boolean) {
  const anchor = audio
    ? Array.from(main()?.querySelectorAll<HTMLElement>('[data-audio-view-anchor]') ?? []).find(
        (node) => node.dataset.audioViewAnchor === saved.anchor,
      )
    : anchors().find(({ id }) => id === saved.anchor)?.node;
  const max =
    (document.scrollingElement?.scrollHeight ?? document.documentElement.scrollHeight) -
    window.innerHeight;
  setTop(
    scrollTarget(
      saved.top,
      saved.offset,
      window.scrollY,
      anchor?.getBoundingClientRect().top ?? null,
      max,
    ),
  );
  const inner = main()?.querySelector<HTMLElement>('[data-page-scroll-pane]');
  if (inner && saved.inner !== undefined) inner.scrollTop = saved.inner;
}
function audioPosition(path: string): PagePosition | null {
  try {
    const saved = parseAudioLibraryView(localStorage.getItem(AUDIO_LIBRARY_VIEW_PREFIX + path));
    return saved
      ? { top: saved.scrollTop, anchor: saved.anchor, offset: saved.anchorOffset }
      : null;
  } catch {
    return null;
  }
}

export function installPageRecovery(instance: Router, store: ReturnType<typeof useAuthStore>) {
  router = instance;
  auth = store;
  router.beforeEach((to) => {
    save();
    window.dispatchEvent(new Event(PAGE_LEAVING));
    generation++;
    cancelLayout?.();
    pending = true;
    pendingDestination = to.fullPath;
    activePath = '';
  });
  router.afterEach((to, _from, failure) => {
    if (failure && pending && !activePath && pendingDestination === to.fullPath) cancel();
  });
  window.addEventListener('scroll', recordScroll, { passive: true });
  document.addEventListener('scroll', recordScroll, { capture: true, passive: true });
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pointerdown', userInteraction, { passive: true });
  window.addEventListener('touchstart', userInteraction, { passive: true });
  window.addEventListener('wheel', userInteraction, { passive: true });
  window.addEventListener('keydown', userInteraction);
  watch(
    () => [auth.initialized, auth.user?.id] as const,
    ([ready, id], [wasReady, oldId]) => {
      if (!ready) return;
      clearOtherPrivateViews(id ?? null);
      if (wasReady && id !== oldId && isPrivatePage(router.currentRoute.value.path)) {
        cancel();
        const path = router.currentRoute.value.fullPath;
        void nextTick().then(() => {
          if (router.currentRoute.value.fullPath === path && !pending) setTop(0);
        });
      }
    },
    { flush: 'sync' },
  );
}

export async function recoverPageScroll(
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
  savedPosition: { top: number; left: number } | null,
): Promise<false> {
  // 同一路由的重复导航或已经被手势取消的恢复，不再执行第二次定位。
  if (
    !pending ||
    pendingDestination !== to.fullPath ||
    router.currentRoute.value.fullPath !== to.fullPath
  )
    return false;
  const token = ++generation;
  cancelLayout?.();
  pending = true;
  activePath = to.path;
  await nextTick();
  if (isPrivatePage(to.path)) await auth.restore();
  if (token !== generation || router.currentRoute.value.fullPath !== to.fullPath) return false;
  await nextTick();
  const audio = isAudioPage(to.path);
  const key = pageViewKey(to.path, identity());
  const saved = audio ? audioPosition(to.path) : key ? readView(key, parsePagePosition) : null;
  await waitForLayout(token, isPrivatePage(to.path) && Boolean(saved));
  if (token !== generation || router.currentRoute.value.fullPath !== to.fullPath) return false;
  // 普通返回和刷新优先使用该页面最新记录，浏览器历史坐标仅作无记录时的后备。
  const navigation = performance.getEntriesByType('navigation')[0] as
    PerformanceNavigationTiming | undefined;
  const reloading = !from.matched.length && navigation?.type === 'reload';
  if (to.hash && !(saved && (reloading || savedPosition))) {
    let id = to.hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      /* 使用原值 */
    }
    const target = document.getElementById(id);
    if (target) target.scrollIntoView({ block: 'start', behavior: 'auto' });
    else if (saved) restorePosition(saved, audio);
    else setTop(0);
  } else if (saved) restorePosition(saved, audio);
  else if (savedPosition && !isPrivatePage(to.path)) setTop(savedPosition.top);
  else setTop(0);
  complete();
  return false;
}
