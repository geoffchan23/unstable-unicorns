import { test, expect, type Browser, type Page } from '@playwright/test';

async function open(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // Server round trips on localhost are fast enough that a state update (e.g. a draw
  // triggering a discard prompt) can land while Playwright is mid-click, unmounting or
  // repositioning the target between its stability check and its post-click "still receiving
  // events" check. Without a bounded default timeout, a click caught by that race retries
  // forever (the actual game action already landed; the locator just never resolves again).
  // Keep the bound tight — every `play()` click below also passes `force: true` so it skips
  // that stability/hit-target polling and just clicks the coordinates of the element we've
  // already confirmed is visible, which is both faster and avoids the race outright; the
  // short default timeout only matters for the rare genuine miss.
  page.setDefaultTimeout(1_000);
  await page.goto('./');
  await page.getByRole('button', { name: 'Play online' }).click();
  await page.getByTestId('name').fill(name);
  return { ctx, page };
}

/**
 * Take one on-screen action for whoever is looking at this page. Unlike `e2e/helpers.ts`'s
 * `step()` (tuned for the local vs-bot spec, where bots do the actual work of winning and the
 * human player mostly just needs to clear prompts), this prioritizes playing a Unicorn card
 * from hand over anything else. With two real human seats and no bots, nobody accumulates
 * unicorns unless someone actually plays Unicorn cards into their stable — `legalActions`
 * always offers `draw` as an option on your turn, and most of the deck is upgrades/downgrades/
 * magic/instants, so a helper that just draws (or plays the first playable card, unicorn or
 * not) would take a very long time, if ever, to reach a winner.
 */
async function play(page: Page): Promise<boolean> {
  const prompt = page.getByTestId('prompt');
  if (await prompt.isVisible().catch(() => false)) {
    const choice = prompt.locator('button:enabled').first();
    await choice.click({ force: true });
    return true;
  }
  const neigh = page.getByTestId('neigh');
  if (await neigh.isVisible().catch(() => false)) {
    await neigh.getByRole('button', { name: 'Let it happen' }).click({ force: true });
    return true;
  }
  const target = page.getByTestId('target');
  if (await target.isVisible().catch(() => false)) {
    await target.locator('.choice').first().click({ force: true });
    return true;
  }
  const hand = page.getByTestId('hand');
  const unicorn = hand.locator(
    'button.card:enabled.t-baby_unicorn, button.card:enabled.t-basic_unicorn, button.card:enabled.t-magical_unicorn',
  ).first();
  if (await unicorn.count()) {
    await unicorn.click({ force: true });
    return true;
  }
  const card = hand.locator('button.card:enabled').first();
  if (await card.count()) {
    await card.click({ force: true });
    return true;
  }
  const draw = page.getByTestId('draw');
  if (await draw.isVisible().catch(() => false)) {
    await draw.click({ force: true });
    return true;
  }
  return false;
}

async function anyStep(pages: Page[]) {
  for (const p of pages) {
    try {
      if (await play(p)) return true;
    } catch {
      // Actionability race (see open() above): the action's target likely already resolved
      // server-side; re-read the DOM on the next loop iteration instead of failing the test.
    }
  }
  return false;
}

test('two players create, join, play to a winner, rejoin after reload, host transfer', async ({ browser }) => {
  // Two networked human-driven clients (no bot speed-up), each following an unoptimized
  // "always play a Unicorn if you can" strategy, typically reach a winner within ~60-90s;
  // give this more room than the 90s default for slower runs.
  test.setTimeout(150_000);
  const a = await open(browser, 'Ann');
  const b = await open(browser, 'Ben');
  await a.page.getByTestId('passphrase').fill('dev');
  await a.page.getByTestId('create').click();
  const code = (await a.page.getByTestId('roomcode').textContent())!.trim();
  expect(code).toMatch(/^[A-Z]{4}$/);
  await b.page.getByRole('button', { name: 'Join a room' }).click();
  await b.page.getByTestId('code').fill(code);
  await b.page.getByTestId('join').click();
  await expect(b.page.getByText('Ann (you)').or(b.page.getByText('Ann · host'))).toBeVisible();
  await expect(a.page.getByText(/Ben/)).toBeVisible();
  await a.page.getByTestId('start').click();
  await expect(a.page.getByTestId('topbar')).toBeVisible();
  await expect(b.page.getByTestId('topbar')).toBeVisible();

  // Ben reloads mid-game and is still seated
  await b.page.reload();
  await expect(b.page.getByTestId('topbar')).toBeVisible();

  for (let i = 0; i < 600; i++) {
    if (await a.page.getByTestId('win').isVisible()) break;
    if (!(await anyStep([a.page, b.page]))) await a.page.waitForTimeout(200);
  }
  await expect(a.page.getByTestId('win')).toBeVisible();
  await expect(b.page.getByTestId('win')).toBeVisible();
  await a.page.screenshot({ path: 'test-results/online-win-a.png' });

  // Host (Ann) leaves for good: after the dev-configured host grace period (3s),
  // Ben becomes host. He should see the "Play again" button on the win overlay.
  await a.ctx.close();
  await expect(b.page.getByTestId('playagain')).toBeVisible({ timeout: 10_000 });
  await b.page.getByTestId('playagain').click();
  await expect(b.page.getByTestId('start')).toBeVisible();
  await b.ctx.close();
});
