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

test('the seat row is one fixed-height strip, current player first, and slides when the turn moves', async ({ page }) => {
  await page.goto('./?seed=5');
  await page.getByRole('button', { name: 'Play on this device' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '+ Add a player' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByTestId('draw')).toBeVisible();

  const row = page.locator('.tbl .seats');
  const seats = row.locator('.tseat');
  await expect(seats).toHaveCount(5);

  // one row: every seat shares a top edge, and the strip scrolls sideways rather than growing
  const box = async () => row.evaluate((el) => {
    const tops = [...el.querySelectorAll('.tseat')].map((s) => Math.round(s.getBoundingClientRect().top));
    return { height: Math.round(el.getBoundingClientRect().height), scrolls: el.scrollWidth > el.clientWidth + 1, tops: [...new Set(tops)].length };
  });
  const before = await box();
  expect(before.tops).toBe(1);
  expect(before.scrolls).toBe(true);

  // the strip starts at whoever's turn it is, and each seat slides to its new place when that changes
  const first = () => seats.first().locator('.tseat-who').textContent();
  const firstBefore = await first();
  await row.evaluate((el) => {
    (window as unknown as { __flip: number }).__flip = 0;
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
      if (this.classList?.contains('tseat')) (window as unknown as { __flip: number }).__flip++;
      return orig.apply(this, args);
    };
    void el;
  });
  // my draw hands the turn to the seat already at the front, so play on until the front actually changes
  await page.getByTestId('draw').click();
  await expect.poll(async () => {
    for (const id of ['pass', 'begin-draw', 'draw'] as const) {
      const b = page.getByTestId(id);
      if (await b.isVisible().catch(() => false)) await b.click({ force: true }).catch(() => {});
    }
    return first();
  }, { timeout: 60_000, intervals: [250] }).not.toBe(firstBefore);
  expect(await page.evaluate(() => (window as unknown as { __flip: number }).__flip)).toBeGreaterThan(0);
  const after = await box();
  expect(after.height).toBe(before.height);
  expect(after.tops).toBe(1);
});
