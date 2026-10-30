import { defineConfig } from '@playwright/test';

// End-to-end tests drive the BUILT extension (dist/) in Chromium with every
// AI provider mocked (e2e/mock-provider.ts). Run `npm run build` first.
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
});
