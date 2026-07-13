import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Standalone test config (does not load the web-extension build plugin).
export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
