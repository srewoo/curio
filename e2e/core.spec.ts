import { expect, test, uploadFile } from './fixtures';
import { TUTOR_ANSWER } from './mock-provider';

const CHAPTER = [
  'The Water Cycle',
  'Evaporation happens when the sun heats water in rivers, lakes and oceans and the water turns into vapour.',
  'Condensation happens when water vapour cools high in the sky and forms tiny droplets that make clouds.',
  'Precipitation is water falling from clouds as rain, snow or hail.',
].join('\n\n');

test('text chapter → summary → streamed, cited answer → source passage', async ({ curio: page }) => {
  await uploadFile(page, 'water-cycle.txt', 'text/plain', Buffer.from(CHAPTER));

  await expect(page.getByText('We will learn about the water cycle.')).toBeVisible();
  await page.getByPlaceholder('Ask about the chapter…').fill('What is evaporation of water by the sun?');
  await page.getByRole('button', { name: 'Send' }).click();

  // The citation chip splits the sentence, so match the text before it.
  await expect(page.getByText(TUTOR_ANSWER.split(' [p.')[0]!)).toBeVisible();
  await page.locator('.curio-cite').first().click();
  await expect(page.getByText('From your chapter · page 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read aloud' })).toBeVisible();
});

test('placement check on a new chapter seeds what the child already knows', async ({ curio: page }) => {
  await uploadFile(page, 'water-cycle.txt', 'text/plain', Buffer.from(CHAPTER));
  await page.getByRole('button', { name: 'Start check' }).click();

  await expect(page.getByText('What do you already know?')).toBeVisible();
  await page.getByText('Heat').first().click(); // right
  await page.getByText("I'm not sure yet").nth(1).click(); // honest "not sure"
  await page.getByRole('button', { name: /submit|check|done/i }).click();

  await expect(page.getByText('Your starting point')).toBeVisible();
  await expect(page.getByText('You already know (1)')).toBeVisible();
  await expect(page.getByText("Let's learn (1)")).toBeVisible();
});

test('library lists a chapter that was studied without a quiz', async ({ curio: page }) => {
  await uploadFile(page, 'water-cycle.txt', 'text/plain', Buffer.from(CHAPTER));
  await expect(page.getByText('We will learn about the water cycle.')).toBeVisible();
  await page.getByRole('button', { name: 'Library' }).click();
  await expect(page.getByText('water-cycle', { exact: true })).toBeVisible();
});
