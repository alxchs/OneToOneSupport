import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Política estrita CSP do ADR-005 para o Guest
const GUEST_CSP =
  "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self';";

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'csp-meta-guest',
      apply: 'build',
      transformIndexHtml: {
        order: 'post',
        handler: (html: string) => {
          // Garante a presença da meta tag de CSP no index.html final
          if (!html.includes('http-equiv="Content-Security-Policy"')) {
            return html.replace(
              '<head>',
              `<head>\n    <meta http-equiv="Content-Security-Policy" content="${GUEST_CSP}" />`
            );
          }
          return html;
        },
      },
    },
    {
      name: 'copy-to-index-html',
      closeBundle() {
        const guestPath = path.resolve(__dirname, 'dist/guest/guest.html');
        const indexPath = path.resolve(__dirname, 'dist/guest/index.html');
        if (fs.existsSync(guestPath)) {
          fs.copyFileSync(guestPath, indexPath);
        }
      },
    },
  ],
  base: '/guest/',
  root: '.',
  build: {
    outDir: 'dist/guest',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'guest.html'),
      },
    },
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
