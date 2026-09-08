import type { Page } from '@playwright/test';

/** Take one on-screen action for whoever is looking at the screen. Returns false if nothing was actionable. */
export async function step(page: Page): Promise<boolean> {
  const handoff = page.getByRole('button', { name: /^I'm / });
  if (await handoff.isVisible()) { await handoff.click(); return true; }
  const prompt = page.getByTestId('prompt');
  if (await prompt.isVisible()) {
    const choice = prompt.locator('button:enabled').first();
    await choice.click(); return true;
  }
  const neigh = page.getByTestId('neigh');
  if (await neigh.isVisible()) { await neigh.getByRole('button', { name: 'Let it happen' }).click(); return true; }
  const target = page.getByTestId('target');
  if (await target.isVisible()) { await target.locator('.choice').first().click(); return true; }
  const draw = page.getByTestId('draw');
  if (await draw.isVisible()) { await draw.click(); return true; }
  const card = page.getByTestId('hand').locator('button.card:enabled').first();
  if (await card.count()) { await card.click(); return true; }
  return false;
}

/** Keep stepping until `done()` is true; waits briefly for bots between steps. */
export async function playUntil(page: Page, done: () => Promise<boolean>, maxSteps = 400): Promise<void> {
  for (let i = 0; i < maxSteps; i++) {
    if (await done()) return;
    if (!(await step(page))) await page.waitForTimeout(250);
  }
  throw new Error(`playUntil: not done after ${maxSteps} steps`);
}
