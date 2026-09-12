import { test, expect } from '@playwright/test';
import { playUntil } from './helpers';

test('vs-bot game reaches a prompt and a winner', async ({ page }) => {
  await page.goto('./?seed=4&motion=off');
  await page.getByRole('button', { name: 'Play on this device' }).click();
  // Seed 42 doesn't reach a winner within the 400-step budget (bots keep
  // Neigh-ing each other into a long game); seed 4 reliably finishes around
  // step ~320.
  await page.getByRole('button', { name: 'Start Game' }).click();
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
  await page.goto('./?seed=7&motion=off');
  await page.getByRole('button', { name: 'Play on this device' }).click();
  await page.getByRole('group', { name: 'Human or bot' }).nth(1).getByRole('button', { name: 'Human' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await playUntil(page, () => page.getByRole('button', { name: /^I'm / }).isVisible(), 60);
  await expect(page.getByText(/Pass the device to/)).toBeVisible();
});

// A render error unmounts the whole tree; without the boundary the family gets a white page.
test('a crash shows a way out instead of a blank screen', async ({ page }) => {
  await page.goto('./?crash=1');
  await expect(page.getByTestId('crashed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();

  // and the way out works: back to the front of the app with the saved game cleared
  await page.getByTestId('crashed-restart').click();
  await expect(page.getByRole('button', { name: 'Play on this device' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('uu.local'))).toBeNull();
});
