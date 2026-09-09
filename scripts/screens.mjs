// Walk every screen on a phone and a tablet profile, light and dark, and save screenshots for review.
// Usage: node scripts/screens.mjs   (needs `npm run dev` running on 5173/8787)
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:5173/unicorns/';
const OUT = 'screens';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

async function step(page) {
  for (const [sel, pick] of [
    ['[data-testid=prompt]', (l) => l.locator('button:enabled:not(.sheet-x):not(.sheet-pill)').first()],
    ['[data-testid=neigh]', (l) => l.getByRole('button', { name: /^(Let it happen|OK)$/ })],
    ['[data-testid=target]', (l) => l.locator('.choice').first()],
    ['[data-testid=detail]', (l) => l.locator('[data-testid=play], button[aria-label="Close"]').first()],
  ]) { const l = page.locator(sel); if (await l.isVisible()) { await pick(l).click(); return true; } }
  const card = page.getByTestId('hand').locator('button.card.playable').first();
  if (await card.count()) { await card.click(); return true; }
  const draw = page.getByTestId('draw'); if (await draw.isVisible()) { await draw.click(); return true; }
  return false;
}

for (const [tag, device] of [['pixel', devices['Pixel 7']], ['ipad', devices['iPad (gen 7)']]]) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ ...device, colorScheme: scheme });
    const page = await ctx.newPage();
    const shot = (name) => page.screenshot({ path: `${OUT}/${tag}-${scheme}-${name}.png`, fullPage: false });
    await page.goto(BASE); await page.waitForTimeout(600); await shot('1-home');
    await page.getByRole('button', { name: 'Play on this device' }).click(); await shot('2-setup');
    await page.getByLabel('Seed').fill('4'); await page.getByRole('button', { name: 'Deal me in' }).click();
    await page.getByTestId('topbar').waitFor(); await page.waitForTimeout(900); await shot('3-game-start');
    { await page.getByTestId('history-open').click(); await page.waitForTimeout(300); await shot('3c-history'); await page.getByTestId('history').getByRole('button', { name: 'Close' }).click(); }
    { await page.getByTestId('stable-toggle').click(); await page.waitForTimeout(300); await shot('3d-stable-open'); await page.getByTestId('stable-toggle').click(); }
    { const c = page.getByTestId('hand').locator('button.card').first(); if (await c.count()) { await c.click(); await page.waitForTimeout(300); await shot('3b-detail'); await page.getByTestId('detail').getByRole('button', { name: 'Close' }).click(); } }
    // play until a prompt or a neigh sheet is on screen, then capture it
    for (let i = 0; i < 60; i++) {
      if (await page.getByTestId('prompt').isVisible() || await page.getByTestId('neigh').isVisible()) break;
      if (!(await step(page))) await page.waitForTimeout(250);
    }
    await page.waitForTimeout(300); await shot('4-sheet');
    // keep going until a choose-a-card prompt (the fluid card grid) is on screen
    // drawing every turn overfills the hand, which forces the end-of-turn discard prompt (a card grid)
    for (let i = 0; i < 300; i++) {
      if (await page.locator('[data-testid=prompt] .card-grid').isVisible() || await page.getByTestId('win').isVisible()) break;
      const draw = page.getByTestId('draw');
      if (await draw.isVisible()) { await draw.click(); continue; }
      if (!(await step(page))) await page.waitForTimeout(200);
    }
    if (await page.locator('[data-testid=prompt] .card-grid').isVisible()) { await page.waitForTimeout(300); await shot('4b-cardgrid'); }
    for (let i = 0; i < 400; i++) { if (await page.getByTestId('win').isVisible()) break; if (!(await step(page))) await page.waitForTimeout(200); }
    await page.waitForTimeout(300); await shot('5-win');
    // online lobby
    await page.goto(BASE); await page.getByRole('button', { name: 'Play online' }).click(); await page.waitForTimeout(400); await shot('6-online-form');
    await page.getByTestId('name').fill('Geoff'); await page.getByTestId('passphrase').fill('dev'); await page.getByTestId('create').click();
    await page.getByTestId('roomcode').waitFor(); await page.getByRole('button', { name: '+ Add a bot' }).click(); await page.waitForTimeout(300); await shot('7-lobby');
    await page.evaluate(() => localStorage.clear());
    await ctx.close();
  }
}
await browser.close();
console.log(`screens written to ${OUT}/`);
