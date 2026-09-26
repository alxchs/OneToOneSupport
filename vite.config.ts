import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

import buildInfo from './src/shared/build-info.json';

// O header CSP do main.ts não é aplicado a páginas file:// (build empacotado); no build a política vai no próprio HTML.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http://127.0.0.1:* http://localhost:*; connect-src 'self' ws: wss: http://127.0.0.1:* http://localhost:*; worker-src 'self' blob:; media-src 'self' blob: http://127.0.0.1:* http://localhost:*;";

export default defineConfig({
  define: {
    'process.env.ONETOONE_DIAG': JSON.stringify(process.env.ONETOONE_DIAG || ''),
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    __APP_BUILD_INFO__: JSON.stringify(buildInfo),
  },
  plugins: [
    react(),
    {
      name: 'csp-meta',
      apply: 'build',
      transformIndexHtml: {
        order: 'post',
        handler: (html: string) =>
          html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
      },
    },
  ],
  base: './',
  root: '.',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      'libsodium-wrappers-sumo': path.resolve(
        __dirname,
        'node_modules/libsodium-wrappers-sumo/dist/modules-sumo/libsodium-wrappers.js'
      ),
    },
  },
});
