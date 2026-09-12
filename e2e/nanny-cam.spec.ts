import { test, expect } from '@playwright/test';

// A Nanny Cam opens someone's hand to the table, which is invisible unless the table says so: the card
// explains where to look, and the seat it applies to says it can be read.
test('a Nanny Cam says whose hand is open and where to look', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./?seed=4&motion=off');
  await page.evaluate(() => localStorage.removeItem('uu.local'));
  await page.goto('./?seed=4&motion=off');
  await page.getByRole('button', { name: 'Play on this device' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByTestId('draw')).toBeVisible();

  // open the card. The fan overlaps, so click the element itself: a forced click at its centre would land
  // on whichever card happens to be drawn on top there.
  const opened = await page.evaluate(() => {
    const cam = [...document.querySelectorAll('[data-testid=hand] button.card')]
      .find((c) => c.getAttribute('aria-label') === 'Nanny Cam') as HTMLElement | undefined;
    if (!cam) return false;
    cam.click();
    return true;
  });
  expect(opened, 'seed 4 deals a Nanny Cam').toBe(true);
  await expect(page.locator('.detail-hint')).toContainText('Tap that player');

  // play it onto the first opponent
  await page.getByTestId('target').locator('.choice').nth(1).click();
  const openSeat = page.locator('.tseat', { has: page.locator('em.open-hand') });
  for (let i = 0; i < 40 && !(await openSeat.count()); i++) {
    for (const id of ['pass', 'begin-draw', 'draw'] as const) {
      const b = page.getByTestId(id);
      if (await b.isVisible().catch(() => false)) { await b.click({ force: true }).catch(() => {}); break; }
    }
    await page.waitForTimeout(150);
  }

  // their seat now advertises the hand, and says to open it
  await expect(openSeat.locator('em.open-hand')).toContainText(/See \d+ cards?/);
  await expect(openSeat.locator('.tseat-btn')).toHaveAttribute('aria-label', /hand is face up: open to see/);

  // and opening it shows the cards
  await openSeat.locator('.tseat-btn').click();
  const sheet = page.getByTestId('expanded');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('h3')).toContainText("'s hand");
  expect(await sheet.locator('.card-grid').last().locator('button.card').count()).toBeGreaterThan(0);
});
