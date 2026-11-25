import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { installPageRecovery } from './router/pageRecovery';
import { useAuthStore } from './stores/auth';
import './styles.css';
import './styles/audio.css';
import './styles/auth.css';
import './styles/space.css';
import './styles/practice.css';
import './styles/assistant.css';

const pinia = createPinia();
const app = createApp(App).use(pinia);
installPageRecovery(router, useAuthStore(pinia));
app.use(router).mount('#app');
