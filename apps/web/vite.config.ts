import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const proxy = {
  '/api': {
    target: `http://127.0.0.1:${process.env.JHAVEN_PROXY_PORT ?? '3001'}`,
    changeOrigin: false,
  },
};

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: { proxy },
  preview: { proxy },
});
