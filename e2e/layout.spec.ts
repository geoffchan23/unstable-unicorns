import { test, expect } from '@playwright/test';

// The table is meant to be one screen. These sizes are the ones the family actually plays on, plus a
// deliberately cramped one; nothing may spill out of the panel it belongs to at any of them.
const SIZES = [
  { name: 'iPhone 12/13/14', width: 390, height: 844 },
  { name: 'Pixel 7', width: 412, height: 915 },
  { name: 'small phone', width: 375, height: 667 },
  { name: 'iPad portrait', width: 820, height: 1180 },
  { name: 'laptop', width: 1280, height: 800 },
];

async function checkSizes(page: import('@playwright/test').Page, when: string) {
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.waitForTimeout(150);
    const out = await page.evaluate(() => {
      const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const centre = box('.centre');
      const spill = (s: string) => {
        if (!document.querySelector(s)) return 0;
        const r = box(s);
        return Math.max(0, Math.round(r.bottom - centre.bottom), Math.round(centre.top - r.top), Math.round(r.right - centre.right), Math.round(centre.left - r.left));
      };
      return {
        deck: spill('.pile.deck'),
        piles: spill('.piles'),
        staged: spill('.stage-cards'),
        seatRowScrolls: (() => { const r = document.querySelector('.tbl .seats')!; return r.scrollHeight <= r.clientHeight + 1; })(),
        sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    expect(out.deck, `${size.name} ${when}: the deck spills out of the table`).toBe(0);
    expect(out.piles, `${size.name} ${when}: the discard/nursery column spills out of the table`).toBe(0);
    expect(out.staged, `${size.name} ${when}: the played card spills out of the table`).toBe(0);
    expect(out.seatRowScrolls, `${size.name} ${when}: the seat row grew a second line`).toBe(true);
    expect(out.sideways, `${size.name} ${when}: the page scrolls sideways`).toBe(false);
  }
}

test('nothing overflows the table panel, at any size we play on', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./?seed=5&motion=off');
  await page.evaluate(() => localStorage.removeItem('uu.local'));
  await page.goto('./?seed=5&motion=off');
  await page.getByRole('button', { name: 'Play on this device' }).click();
  await page.getByRole('button', { name: '+ Add a player' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByTestId('draw')).toBeVisible();

  await checkSizes(page, 'with an empty table');

  // and with the busiest thing the table ever holds: a card on the stage waiting on Neighs
  await page.setViewportSize({ width: 390, height: 844 });
  const card = page.getByTestId('hand').locator('button.card.playable').last();
  await card.click({ force: true });
  const target = page.getByTestId('target');
  if (await target.isVisible().catch(() => false)) await target.locator('.choice').first().click();
  else await page.getByTestId('play').click();
  await expect(page.locator('.stage-cards')).toBeVisible();
  await checkSizes(page, 'with a card on the stage');
});
