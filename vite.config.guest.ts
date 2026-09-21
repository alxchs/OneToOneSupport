import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { GUEST_CSP } from './src/shared/csp';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'csp-meta-guest',
      apply: 'build',
      transformIndexHtml: {
        order: 'post',
        handler: (html: string) => {
          const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${GUEST_CSP}" />`;
          // Garante a presença e exata sincronia da meta tag de CSP no HTML final
          if (html.includes('http-equiv="Content-Security-Policy"')) {
            return html.replace(
              /<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*"\s*\/?>/i,
              cspMeta
            );
          }
          return html.replace('<head>', `<head>\n    ${cspMeta}`);
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
