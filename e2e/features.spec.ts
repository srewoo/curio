import { readableText } from '../src/lib/ingest/readable-text';
import { expect, test, uploadFile } from './fixtures';
import { WEB_ANSWER } from './mock-provider';

const CHAPTER = 'Evaporation happens when the sun heats water and the water turns into vapour.\n\nClouds form from droplets.';

test('web search (parent-enabled) answers off-chapter questions with a label and sources', async ({ curio: page }) => {
  await page.evaluate(async () => {
    const bag = await chrome.storage.local.get('curio.settings');
    await chrome.storage.local.set({ 'curio.settings': { ...bag['curio.settings'], webSearch: true } });
  });
  await page.reload();
  await uploadFile(page, 'water.txt', 'text/plain', Buffer.from(CHAPTER));
  await page.getByPlaceholder('Ask about the chapter…').fill('Why do rainbows have seven colours?');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText(WEB_ANSWER)).toBeVisible();
  await expect(page.getByText('From the web — not from your chapter')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Rainbows for kids' })).toHaveAttribute('href', 'https://kids.example.org/rainbow');
});

test('without web search, off-chapter questions get the chapter-only reply', async ({ curio: page }) => {
  await uploadFile(page, 'water.txt', 'text/plain', Buffer.from(CHAPTER));
  await page.getByPlaceholder('Ask about the chapter…').fill('Why do rainbows have seven colours?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText("That's not in this chapter")).toBeVisible();
});

test('settings PIN locks settings until the right PIN is entered', async ({ curio: page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('New settings PIN').fill('2468');
  await page.getByRole('button', { name: 'Save' }).click();

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByText('Grown-ups only')).toBeVisible();
  await page.getByLabel('Settings PIN').fill('1111');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText("That PIN didn't match.")).toBeVisible();
  await page.getByLabel('Settings PIN').fill('2468');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('Tutor style')).toBeVisible();
});

test('chat exports to a Markdown file', async ({ curio: page }) => {
  await uploadFile(page, 'water.txt', 'text/plain', Buffer.from(CHAPTER));
  await page.getByPlaceholder('Ask about the chapter…').fill('What is evaporation of water?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('.curio-cite').first()).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('water.md');
  expect(await file.path()).toBeTruthy(); // let it finish so shutdown doesn't wait
});

test('web page capture keeps article text and drops site chrome', async ({ page }) => {
  await page.setContent(`
    <header><nav>Home | Shop</nav></header>
    <article><h1>Volcanoes</h1><p>Magma rises through cracks.</p><ul><li><p>Lava cools into rock.</p></li></ul></article>
    <footer>© Site</footer>`);
  const text = await page.evaluate(`(${readableText.toString()})()`);
  expect(text).toBe('# Volcanoes\n\nMagma rises through cracks.\n\n- Lava cools into rock.');
});
