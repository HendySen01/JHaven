import { nextTick } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import { useAuthStore } from '../stores/auth';

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
      path: '/register',
      name: 'register',
      component: () => import('../views/AuthView.vue'),
      props: { registration: true },
      meta: { title: '创建账户' },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/AuthView.vue'),
      props: { registration: false },
      meta: { title: '登录' },
    },
    {
      path: '/account',
      name: 'account',
      component: () => import('../views/AccountView.vue'),
      meta: { title: '我的账户' },
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

router.beforeEach(async (to) => {
  if (to.name !== 'account' && to.name !== 'login' && to.name !== 'register') return;
  const auth = useAuthStore();
  await auth.restore();
  if (to.name === 'account' && !auth.signedIn) return { name: 'login' };
  if ((to.name === 'login' || to.name === 'register') && auth.signedIn) return { name: 'account' };
});

router.afterEach(async (to, from) => {
  document.title = `JHaven · ${String(to.meta.title)}`;
  if (to.path !== from.path && from.matched.length > 0) {
    await nextTick();
    document.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }
});
