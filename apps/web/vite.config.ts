import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { createReadStream, statSync } from 'node:fs';
import { defineConfig, type Connect, type Plugin } from 'vite';
import catalog from '../../packages/shared/src/sound-catalog.json' with { type: 'json' };

const proxy = {
  '/api': {
    target: `http://127.0.0.1:${process.env.JHAVEN_PROXY_PORT ?? '3001'}`,
    changeOrigin: false,
  },
};

const directory = new URL('../../artifacts/user-audio-rendered/', import.meta.url);
const localFiles = new Map(
  Object.entries(catalog)
    .filter(([, track]) => 'localOnly' in track)
    .map(([id]) => [`/audio/${id}.wav`, { id, file: new URL(`${id}.wav`, directory) }]),
);
const localAudio =
  (enabled: boolean): Connect.NextHandleFunction =>
  (request, response, next) => {
    const pathname = request.url?.split('?')[0] ?? '';
    const track = localFiles.get(pathname);
    const catalogRequest = pathname === '/audio/local-library.json';
    if (!track && !catalogRequest) return next();
    const loopback =
      ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '') &&
      /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(request.headers.host ?? '') &&
      !request.headers.forwarded &&
      !request.headers['x-forwarded-for'];
    if (!enabled || !loopback || !['GET', 'HEAD'].includes(request.method ?? '')) {
      response.statusCode = 404;
      return response.end();
    }
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (catalogRequest) {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      const available = [...localFiles.values()].filter(({ file }) =>
        statSync(file, { throwIfNoEntry: false })?.isFile(),
      );
      return response.end(
        request.method === 'HEAD' ? undefined : JSON.stringify(available.map(({ id }) => id)),
      );
    }
    const info = track && statSync(track.file, { throwIfNoEntry: false });
    if (!track || !info?.isFile()) {
      response.statusCode = 404;
      return response.end();
    }
    response.setHeader('Content-Type', 'audio/wav');
    response.setHeader('Content-Length', info.size);
    if (request.method === 'HEAD') return response.end();
    const stream = createReadStream(track.file);
    response.on('close', () => stream.destroy());
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  };
const localAudioPlugin: Plugin = {
  name: 'jhaven-local-audio',
  configureServer(server) {
    server.middlewares.use(localAudio(true));
  },
  configurePreviewServer(server) {
    server.middlewares.use(localAudio(process.env.JHAVEN_LOCAL_AUDIO === '1'));
  },
};

export default defineConfig({
  plugins: [vue(), tailwindcss(), localAudioPlugin],
  server: {
    proxy,
    fs: {
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem,key,p12,pfx,cer,der}',
        '.npmrc',
        '.yarnrc.yml',
        '**/.git/**',
        '**/artifacts/user-audio/**',
        '**/artifacts/user-audio-rendered/**',
      ],
    },
  },
  preview: { proxy },
});
