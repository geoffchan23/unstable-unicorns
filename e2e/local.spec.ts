import { test, expect } from '@playwright/test';
import { playUntil } from './helpers';

test('vs-bot game reaches a prompt and a winner', async ({ page }) => {
  await page.goto('./?seed=4');
  await page.getByRole('button', { name: 'Play on this device' }).click();
  // Seed 42 doesn't reach a winner within the 400-step budget (bots keep
  // Neigh-ing each other into a long game); seed 4 reliably finishes around
  // step ~320.
  await page.getByRole('button', { name: 'Deal me in' }).click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  let sawPrompt = false;
  await playUntil(page, async () => {
    if (await page.getByTestId('prompt').isVisible()) sawPrompt = true;
    return page.getByTestId('win').isVisible();
  });
  expect(sawPrompt).toBe(true);
  await expect(page.getByTestId('win')).toContainText('wins');
  await page.screenshot({ path: 'test-results/local-win.png' });
});

test('hot-seat handoff appears with two humans', async ({ page }) => {
  await page.goto('./?seed=7');
  await page.getByRole('button', { name: 'Play on this device' }).click();
  await page.getByRole('group', { name: 'Human or bot' }).nth(1).getByRole('button', { name: 'Human' }).click();
  await page.getByRole('button', { name: 'Deal me in' }).click();
  await playUntil(page, () => page.getByRole('button', { name: /^I'm / }).isVisible(), 60);
  await expect(page.getByText(/Pass the device to/)).toBeVisible();
});
