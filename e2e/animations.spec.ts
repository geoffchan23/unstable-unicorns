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
  // the bot's turn produces a bubble by its avatar, in the layer that draws over the table
  await expect(page.locator('.bubble-layer .seat-bubble').first()).toBeVisible({ timeout: 8000 });
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

test('dragging a card onto the table plays it, and a cancelled pointer does not', async ({ page }) => {
  await page.goto('./?seed=4&motion=off');
  await page.getByRole('button', { name: 'Play on this device' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByTestId('draw')).toBeVisible();

  // drag the topmost playable card towards the middle of the table, and leave the pointer down there
  const startDrag = () => page.evaluate(() => {
    const slot = [...document.querySelectorAll('[data-testid=hand] .fan-slot.can')].pop() as HTMLElement;
    const name = slot.querySelector('button')!.getAttribute('aria-label')!;
    const r = slot.getBoundingClientRect();
    const centre = document.querySelector('.centre')!.getBoundingClientRect();
    const from = { x: r.left + r.width / 2, y: r.top + 40 };
    const to = { x: centre.left + centre.width / 2, y: centre.top + centre.height / 2 };
    const fire = (type: string, x: number, y: number) => slot.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true }));
    fire('pointerdown', from.x, from.y);
    for (let i = 1; i <= 10; i++) fire('pointermove', from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
    (window as unknown as { __drag: unknown }).__drag = { slot, to, fire };
    return name;
  });
  // ...then end it, however we are told to
  const endDrag = (how: 'up' | 'cancel') => page.evaluate((h) => {
    const d = (window as unknown as { __drag: { to: { x: number; y: number }; fire: (t: string, x: number, y: number) => void } }).__drag;
    d.fire(h === 'cancel' ? 'pointercancel' : 'pointerup', d.to.x, d.to.y);
  }, how);

  const handNames = () => page.getByTestId('hand').locator('button.card').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));

  // a cancelled gesture (a second finger, an OS gesture) puts the card back and plays nothing
  const before = await handNames();
  await startDrag();
  await expect(page.locator('.fan-slot.lifted')).toHaveCount(1);
  await endDrag('cancel');
  await expect(page.locator('.fan-slot.lifted')).toHaveCount(0);
  expect(await handNames()).toEqual(before);
  await expect(page.locator('.stage-base')).toHaveCount(0);

  // letting go over the table plays it
  // let the card finish springing back into the fan: a drag measured mid-animation starts from where the
  // card is *now*, which is halfway up the table, and reads as a sideways sort rather than a lift
  await page.waitForTimeout(450);
  const name = await startDrag();
  await expect(page.locator('.fan-slot.lifted')).toHaveCount(1);
  await endDrag('up');
  await expect.poll(handNames, { timeout: 5000 }).not.toContain(name);
});

test('a touch drag plays the card too (the browser hands the gesture over differently than a mouse)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'raw touch events are dispatched through CDP');
  await page.goto('./?seed=4&motion=off');
  await page.getByRole('button', { name: 'Play on this device' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByTestId('draw')).toBeVisible();

  const spot = await page.evaluate(() => {
    const slot = [...document.querySelectorAll('[data-testid=hand] .fan-slot.can')].pop() as HTMLElement;
    const r = slot.getBoundingClientRect();
    const centre = document.querySelector('.centre')!.getBoundingClientRect();
    return {
      card: slot.querySelector('button')!.getAttribute('aria-label')!,
      from: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 40) },
      to: { x: Math.round(centre.left + centre.width / 2), y: Math.round(centre.top + centre.height / 2) },
    };
  });

  // a real finger, not a mouse: touch gives the element implicit pointer capture, which the drag must survive
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });

  await touch('touchStart', spot.from.x, spot.from.y);
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', spot.from.x + ((spot.to.x - spot.from.x) * i) / 12, spot.from.y + ((spot.to.y - spot.from.y) * i) / 12);
    await page.waitForTimeout(16);
  }
  await expect(page.locator('.fan-slot.lifted')).toHaveCount(1);
  await expect(page.locator('.centre.drop-over')).toHaveCount(1);

  await touch('touchEnd', spot.to.x, spot.to.y);
  await expect.poll(() => page.getByTestId('hand').locator('button.card').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))), { timeout: 5000 })
    .not.toContain(spot.card);
});
