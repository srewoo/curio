import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import webExtension from 'vite-plugin-web-extension';

// Curio is a client-only MV3 extension (TRD §3). The popup window (index.html)
// owns all session state; the service worker is a stateless broker. index.html,
// privacy.html, and help.html are all opened programmatically (not referenced
// from the manifest), so they're registered as additional build inputs.
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  plugins: [
    react(),
    webExtension({
      manifest: 'manifest.json',
      additionalInputs: ['index.html', 'privacy.html', 'help.html'],
    }),
  ],
  build: {
    target: 'esnext',
    // Heavy runtime libs (transformers.js, pdf.js) are dynamically imported at
    // point of use so they do not bloat the initial popup bundle (PRD §7.2).
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      external: ['jsdom'],
    },
    // NOTE: Chrome rejects files whose names start with "_" (e.g. Vite's
    // _commonjsHelpers chunk). The web-extension plugin overrides Rollup's
    // chunkFileNames, so we rename such files as a post-build step:
    // scripts/fix-underscore.mjs (run from the `build` script).
  },
});
