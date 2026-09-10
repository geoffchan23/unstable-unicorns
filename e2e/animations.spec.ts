import { test, expect } from '@playwright/test';

// Motion on: the staged playback really flies cards and holds decisions back until it is done.
test('a draw flies a card from the deck, then the next turn is announced', async ({ page }) => {
  await page.goto('./?seed=11');
  await page.getByRole('button', { name: 'Play on this device' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByTestId('draw')).toBeVisible();
  const handBefore = await page.getByTestId('hand').locator('.fan-slot').count();
  await page.getByTestId('draw').click();
  await expect(page.locator('.flyer.how-draw')).toBeVisible({ timeout: 3000 });
  await expect(page.getByTestId('hand').locator('.fan-slot')).toHaveCount(handBefore + 1);
  await expect(page.locator('.turn-banner')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.turn-banner')).toContainText(/turn/i);
  // the bot's turn produces a bubble by its avatar
  await expect(page.locator('.tseat .bubble').first()).toBeVisible({ timeout: 8000 });
});

test('playing a card puts it on the stage before the Neigh window opens', async ({ page }) => {
  await page.goto('./?seed=4');
  await page.getByRole('button', { name: 'Play on this device' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  const card = page.getByTestId('hand').locator('button.card.playable').last();
  await expect(card).toBeVisible();
  await card.click();
  await page.getByTestId('play').click();
  await expect(page.locator('.stage-base')).toBeVisible({ timeout: 3000 });
  // the table is busy while the card flies; the sheet arrives after
  await expect(page.locator('.mine-bubble')).toBeVisible({ timeout: 3000 });
  await expect(page.getByTestId('neigh').or(page.getByTestId('prompt')).or(page.getByTestId('draw'))).toBeVisible({ timeout: 10000 });
});
