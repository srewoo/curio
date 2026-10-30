import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockAnthropic } from './mock-provider';

// Launch Chromium with the built extension loaded, providers mocked, and the
// embedding-model download blocked (Curio then uses its lexical fallback,
// which keeps runs fast and deterministic).
const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

interface Fixtures {
  context: BrowserContext;
  extensionId: string;
  curio: Page; // index.html with an API key + settings already saved
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'curio-e2e-')), {
      channel: 'chromium',
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    });
    await context.route('https://api.anthropic.com/**', mockAnthropic);
    await context.route(/huggingface\.co/, (route) => route.abort());
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(new URL(sw.url()).host);
  },
  curio: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/index.html`);
    await page.evaluate(async () => {
      await chrome.storage.local.set({
        'curio.apiKey': 'sk-ant-test-key',
        'curio.settings': {
          ageBand: 12,
          language: 'en',
          provider: 'anthropic',
          textModel: 'claude-sonnet-5',
          visionModel: 'claude-sonnet-5',
          consent: { provider: 'anthropic', acceptedAt: new Date().toISOString() },
        },
      });
    });
    await page.reload();
    await use(page);
  },
});

export const expect = test.expect;

export async function uploadFile(page: Page, name: string, mimeType: string, buffer: Buffer): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer });
}
