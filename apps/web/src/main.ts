import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { loadLocalTracks } from './types/audio';
import './styles.css';
import './styles/audio.css';
import './styles/auth.css';
import './styles/space.css';
import './styles/practice.css';
import './styles/assistant.css';

void loadLocalTracks().then(() => createApp(App).use(createPinia()).use(router).mount('#app'));
