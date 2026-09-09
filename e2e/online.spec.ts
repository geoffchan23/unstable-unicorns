import { test, expect, type Browser, type Page } from '@playwright/test';

async function open(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
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
 *
 * `force` skips Playwright's stability/hit-target polling before clicking. Server round trips
 * on localhost are fast enough that a state update (e.g. a draw triggering a discard prompt)
 * can land while Playwright is mid-click, unmounting or repositioning the target between its
 * stability check and its post-click "still receiving events" check — without `force`, a click
 * caught by that race retries against a now-vanished locator until `page.setDefaultTimeout`
 * gives up. Callers pass `force: false` for the first click on a page so that one real click
 * still goes through the normal actionability/hit-target checks (catching a genuinely covered
 * or unclickable button), then switch to `force: true` once that's confirmed clean.
 */
async function play(page: Page, force: boolean): Promise<boolean> {
  const opts = { force };
  const prompt = page.getByTestId('prompt');
  if (await prompt.isVisible().catch(() => false)) {
    const choice = prompt.locator('button:enabled:not(.sheet-x):not(.sheet-pill)').first();
    await choice.click(opts);
    return true;
  }
  const neigh = page.getByTestId('neigh');
  if (await neigh.isVisible().catch(() => false)) {
    await neigh.getByRole('button', { name: 'Let it happen' }).click(opts);
    return true;
  }
  const target = page.getByTestId('target');
  if (await target.isVisible().catch(() => false)) {
    await target.locator('.choice').first().click(opts);
    return true;
  }
  const detail = page.getByTestId('detail');
  if (await detail.isVisible().catch(() => false)) {
    const playBtn = detail.getByTestId('play');
    if (await playBtn.isVisible().catch(() => false)) await playBtn.click(opts);
    else await detail.getByRole('button', { name: 'Close' }).click(opts);
    return true;
  }
  const hand = page.getByTestId('hand');
  const unicorn = hand.locator(
    'button.card.playable.t-baby_unicorn, button.card.playable.t-basic_unicorn, button.card.playable.t-magical_unicorn',
  ).first();
  if (await unicorn.count()) {
    await unicorn.click(opts);
    return true;
  }
  const card = hand.locator('button.card.playable').first();
  if (await card.count()) {
    await card.click(opts);
    return true;
  }
  const draw = page.getByTestId('draw');
  if (await draw.isVisible().catch(() => false)) {
    await draw.click(opts);
    return true;
  }
  return false;
}

async function anyStep(pages: Page[], acted: Set<Page>) {
  for (const p of pages) {
    try {
      if (await play(p, acted.has(p))) {
        acted.add(p);
        return true;
      }
    } catch {
      // Actionability race (see play() above): the action's target likely already resolved
      // server-side; re-read the DOM on the next loop iteration instead of failing the test.
    }
  }
  return false;
}

/**
 * On the iPad project (>=720px), `.game` is a named-area grid; a banner without a placed grid
 * area would fall back to auto-placement at the bottom-left instead of sitting under the top
 * bar. There's no deterministic way to force a banner to appear (the "waiting on ... (offline)"
 * banner depends on whose turn it is when a seat drops), so this opportunistically checks
 * placement whenever one happens to be on screen, and is a no-op otherwise.
 */
async function assertBannerPlacedIfPresent(page: Page) {
  if (test.info().project.name !== 'ipad') return;
  const result = await page.evaluate(() => {
    const banner = document.querySelector('.banner');
    const opponents = document.querySelector('.opponents');
    if (!banner || !opponents) return null;
    return banner.getBoundingClientRect().top < opponents.getBoundingClientRect().top;
  });
  if (result !== null) expect(result).toBe(true);
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

  // Only the play loop below needs a tight action timeout (to bound the actionability race
  // described in play()'s docstring); leave the lobby/setup steps above and the post-game
  // assertions below on the suite's normal defaults.
  a.page.setDefaultTimeout(1_000);
  b.page.setDefaultTimeout(1_000);

  // Ben reloads mid-game and is still seated
  await b.page.reload();
  await expect(b.page.getByTestId('topbar')).toBeVisible();
  await assertBannerPlacedIfPresent(b.page);

  const acted = new Set<Page>();
  for (let i = 0; i < 600; i++) {
    if (await a.page.getByTestId('win').isVisible()) break;
    if (!(await anyStep([a.page, b.page], acted))) await a.page.waitForTimeout(200);
    if (i % 20 === 0) {
      await assertBannerPlacedIfPresent(a.page);
      await assertBannerPlacedIfPresent(b.page);
    }
  }

  a.page.setDefaultTimeout(10_000);
  b.page.setDefaultTimeout(10_000);

  await expect(a.page.getByTestId('win')).toBeVisible();
  await expect(b.page.getByTestId('win')).toBeVisible();
  await a.page.screenshot({ path: 'test-results/online-win-a.png' });

  // Host (Ann) leaves for good. Ben becomes host after the host-grace period, at which point
  // he sees "Play again" on the win overlay. `scripts/dev.mjs` sets HOST_GRACE_MS=3000 for a
  // fast dev server, but the webServer config reuses an already-running server
  // (`reuseExistingServer: true`), so a stale server started without that env (e.g. left over
  // from before this env var existed) would fall back to the server's default 20s grace.
  // 30s covers that default with margin while staying well under the test timeout.
  await a.ctx.close();
  await assertBannerPlacedIfPresent(b.page);
  await expect(b.page.getByTestId('playagain')).toBeVisible({ timeout: 30_000 });
  await b.page.getByTestId('playagain').click();
  await expect(b.page.getByTestId('start')).toBeVisible();

  // Ben (now sole connected player, host of the fresh lobby - Ann's seat is still there but
  // offline) starts a second round so there's a game in progress again: the win overlay is
  // modal and has no quit affordance, so "outside lobby status" (ruling F) is only reachable
  // from the topbar's "Quit", which only changes screens - it doesn't touch the stored
  // session. Home then offers both "Back to my game" and the new "Leave this game"
  // (forget()); clicking it clears the session and Home falls back to plain "Play online" -
  // no session remains.
  await b.page.getByTestId('start').click();
  await expect(b.page.getByTestId('topbar')).toBeVisible();
  await b.page.getByRole('button', { name: 'Quit' }).click();
  await expect(b.page.getByRole('button', { name: 'Back to my game' })).toBeVisible();
  await b.page.getByTestId('forget').click();
  await expect(b.page.getByRole('button', { name: 'Play online' })).toBeVisible();
  await b.ctx.close();
});
