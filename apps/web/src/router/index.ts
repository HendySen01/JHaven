import { nextTick } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView, meta: { title: '你的宁静港湾' } },
    {
      path: '/relax',
      component: () => import('../views/RelaxView.vue'),
      meta: { title: '选择放松场景' },
    },
    {
      path: '/relax/:sceneId',
      component: () => import('../views/SceneDetailView.vue'),
      meta: { title: '场景预览' },
    },
    {
      path: '/journal',
      component: () => import('../views/JournalView.vue'),
      meta: { title: '睡眠日记' },
    },
    {
      path: '/sound-evidence',
      component: () => import('../views/SoundEvidenceView.vue'),
      meta: { title: '声音用途与研究依据' },
    },
    {
      path: '/about',
      component: () => import('../views/AboutView.vue'),
      meta: { title: '关于 Alpha' },
    },
    {
      path: '/:pathMatch(.*)*',
      component: () => import('../views/NotFoundView.vue'),
      meta: { title: '页面未找到' },
    },
  ],
  scrollBehavior(to, _from, savedPosition) {
    return savedPosition ?? (to.hash ? { el: to.hash } : { top: 0 });
  },
});

router.afterEach(async (to, from) => {
  document.title = `JHaven · ${String(to.meta.title)}`;
  if (to.path !== from.path && from.matched.length > 0) {
    await nextTick();
    document.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }
});
