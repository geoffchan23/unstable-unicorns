import { test, expect } from '@playwright/test';
import WebSocket from 'ws';
import { readFileSync } from 'node:fs';
import type { Action } from '../src/engine/types';
import type { PlayerView } from '../src/engine/view';

// A card taken by searching the deck is revealed to the table (RULES.md §9). The searcher's own hand is
// face up to them anyway, so the reveal only shows for everyone else: they see the card face up on the
// stage before it goes into a hand they cannot read. The opponent here is a scripted websocket client,
// so the browser is always the one watching.

const SERVER = `ws://localhost:${process.env.UNICORNS_SERVER_PORT ?? '8787'}`;
// 2 players: the first seat opens with The Great Narwhal, goes first, and a Narwhal is still in the deck
const SEED = 5;
const NAMES: Record<string, string> = Object.fromEntries(
  (JSON.parse(readFileSync('data/base-set-2e.json', 'utf8')).cards as { id: string; name: string }[]).map((c) => [c.id, c.name]),
);

test('an opponent\'s deck search is shown face up on the stage', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough for this');
  test.setTimeout(90_000);
  const ws = new WebSocket(SERVER);
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  const send = (m: object) => ws.send(JSON.stringify(m));
  let code = '';
  let seat = -1;
  let taken: string | null = null;
  let greatNarwhal: number | null = null;

  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === 'joined') { code = m.code; seat = m.seat; }
    if (m.type === 'lobby' && m.status === 'lobby' && m.seats.length === 2) send({ type: 'start', seed: SEED });
    if (m.type !== 'state') return;
    const view = m.view as PlayerView; const legal = m.legal as Action[];
    if (!legal.length || view.winner !== null) return;
    greatNarwhal ??= view.players[seat]!.hand!.find((c) => view.cards[c]!.def === 'the-great-narwhal') ?? null;
    const pending = view.pending;
    // the search prompt: take the first Narwhal on offer and remember which one
    if (pending?.kind === 'prompt' && pending.prompt.player === seat && pending.prompt.source === greatNarwhal) {
      const pick = pending.prompt.options[0] as number;
      taken = NAMES[view.cards[pick]!.def]!;
      send({ type: 'action', action: { type: 'respond', player: seat, promptId: pending.prompt.id, answer: pick } });
      return;
    }
    const play = legal.find((a) => a.type === 'play' && a.card === greatNarwhal);
    const quiet = legal.find((a) => a.type === 'beginTurn' && a.card === null) ?? legal.find((a) => a.type === 'pass')
      ?? legal.find((a) => a.type === 'draw') ?? legal.find((a) => a.type === 'respond');
    const a = play ?? quiet;
    if (!a) return;
    if (a.type === 'respond' && pending?.kind === 'prompt') {
      const p = pending.prompt;
      send({ type: 'action', action: { ...a, answer: p.optional ? null : p.count ? p.options.slice(0, p.count) : p.options[0] } });
    } else send({ type: 'action', action: a });
  });
  send({ type: 'create', name: 'Host' });
  await expect.poll(() => code).toMatch(/^[A-Z]{4}$/);

  // the guest, animations on (no ?motion=off): the reveal is an animation
  await page.goto(`./?join=${code}`);
  await page.getByTestId('name').fill('Guest');
  await page.getByTestId('join').click();

  const revealed = page.locator('.flyer.how-search .card');
  for (let i = 0; i < 200 && !(await revealed.count()); i++) {
    // keep the guest's side moving without playing anything
    for (const id of ['begin-draw', 'draw'] as const) {
      const b = page.getByTestId(id);
      if (await b.isVisible().catch(() => false)) { await b.click({ force: true }).catch(() => {}); break; }
    }
    const neigh = page.getByTestId('neigh').getByRole('button', { name: /^(Let it happen|OK)$/ });
    if (await neigh.isVisible().catch(() => false)) await neigh.click({ force: true }).catch(() => {});
    const prompt = page.getByTestId('prompt').locator('button:enabled:not(.sheet-x):not(.sheet-pill)').first();
    if (await prompt.isVisible().catch(() => false)) await prompt.click({ force: true }).catch(() => {});
    await page.waitForTimeout(100);
  }
  await expect(revealed.first()).toBeVisible();
  expect(taken).not.toBeNull();
  await expect(revealed.first()).toContainText(taken!);
  // once it lands it sits on the stage, readable, not at the size of a seat avatar
  await page.waitForTimeout(650);
  if (process.env.REVEAL_SHOT) await page.screenshot({ path: process.env.REVEAL_SHOT });
  await expect(revealed.first()).toContainText(taken!);
  const box = (await revealed.first().boundingBox())!;
  expect(box.width).toBeGreaterThan(60);
  ws.close();
});
