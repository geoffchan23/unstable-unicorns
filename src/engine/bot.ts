import type { Action, GameState, PlayerId } from './types';
import { legalActions } from './game';

/** Which players can act right now? */
export function playersToAct(state: GameState): PlayerId[] {
  if (state.winner !== null) return [];
  const p = state.pending;
  if (p) return p.kind === 'prompt' ? [p.prompt.player] : p.kind === 'beginTurn' ? [p.player] : [...p.awaiting];
  return state.turn.phase === 'action' ? [state.turn.player] : [];
}

/** A uniformly random legal action for the given player, using an external RNG. */
export function randomBotAction(state: GameState, player: PlayerId, rand: () => number): Action | null {
  const acts = legalActions(state, player);
  if (acts.length === 0) return null;
  return acts[Math.floor(rand() * acts.length)]!;
}

// ---------------------------------------------------------------------------
// Greedy one-ply bot. It searches a *determinized* copy of the game, so it plans
// with no more knowledge than a player in its seat would have.
// ---------------------------------------------------------------------------

import { applyAction, previewState } from './game';
import { typeOf, unicornCount } from './queries';
import { canSeeHand } from './view';

/**
 * Re-deal everything the bot is not allowed to know. It legitimately knows its own hand, every public
 * zone, and therefore the *multiset* of cards it has not seen (84 known cards minus what is on the
 * table) — but not which of those sits in whose hand, nor the order of the deck. So the unseen cards
 * are pooled and dealt back at random into the same slots they came from.
 *
 * The pool is sorted before the shuffle on purpose: the deal must depend only on which cards are
 * unseen, never on where they actually are. That is what makes the bot's choice provably independent
 * of hidden information (`bot-knowledge.test.ts`), and it is why the result is only ever used to
 * *score* actions — the action itself is always picked from `legalActions` on the real state.
 */
function determinize(state: GameState, me: PlayerId, rand: () => number): GameState {
  const hiddenHands = state.players.filter((p) => !canSeeHand(state, me, p.id));
  const pool = [...state.deck, ...hiddenHands.flatMap((p) => p.hand)].sort((a, b) => a - b);
  if (pool.length === 0) return state;
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const next = structuredClone(state);
  let at = 0;
  next.deck = pool.slice(at, (at += state.deck.length));
  for (const p of hiddenHands) next.players[p.id]!.hand = pool.slice(at, (at += p.hand.length));
  return next;
}

function score(state: GameState, me: PlayerId): number {
  if (state.winner === me) return 1e6;
  if (state.winner !== null) return -1e6;
  const mine = unicornCount(state, me);
  let best = 0;
  for (const p of state.players) if (p.id !== me) best = Math.max(best, unicornCount(state, p.id));
  const hand = state.players[me]!.hand.length;
  const stable = state.players[me]!.stable.length;
  // Upgrades help their owner, Downgrades hurt them: count mine for me, and everyone else's against me
  let gear = 0;
  for (const p of state.players) {
    const sign = p.id === me ? 1 : -1 / (state.players.length - 1);
    for (const c of p.stable) {
      const t = typeOf(state, c);
      if (t === 'upgrade') gear += 2 * sign;
      else if (t === 'downgrade') gear -= 2 * sign;
    }
  }
  return mine * 10 - best * 8 + Math.min(hand, 6) * 0.6 + stable * 0.3 + gear;
}

/** apply an action, then auto-resolve Neigh windows (everyone passes) and prompts (greedily for `me`, first option otherwise). */
function settle(state: GameState, me: PlayerId, action: Action, rand: () => number, depth = 0): GameState {
  let s: GameState;
  try {
    s = applyAction(state, action);
  } catch {
    return state;
  }
  for (let i = 0; i < 12 && s.pending && s.winner === null; i++) {
    const p = s.pending;
    if (p.kind === 'neighWindow') {
      s = applyAction(s, { type: 'pass', player: p.awaiting[0]! });
      continue;
    }
    if (p.kind === 'beginTurn') {
      // during lookahead, take the plain option: draw without using anything
      s = applyAction(s, { type: 'beginTurn', player: p.player, card: null });
      continue;
    }
    const who = p.prompt.player;
    const opts = legalActions(s, who);
    if (opts.length === 0) break;
    if (who === me && depth < 1) {
      s = settle(s, me, bestOf(s, me, opts, rand, depth + 1), rand, depth + 1);
    } else {
      s = applyAction(s, opts[Math.floor(rand() * opts.length)]!);
    }
  }
  return s;
}

function bestOf(state: GameState, me: PlayerId, options: Action[], rand: () => number, depth = 0): Action {
  let best = options[0]!;
  let bestV = -Infinity;
  const neutral = safely(() => score(previewState(state), me), 0);
  for (const a of options) {
    // An option can be impossible in a re-dealt world without being impossible in the real game: an
    // answer already recorded may name a card that this world has put somewhere else, and replaying
    // the effect throws. Such an option tells us nothing, so it is worth exactly what doing nothing is.
    const v = safely(() => score(previewState(settle(state, me, a, rand, depth)), me), neutral) + rand() * 0.5;
    if (v > bestV) { bestV = v; best = a; }
  }
  return best;
}

function safely(f: () => number, fallback: number): number {
  try {
    const v = f();
    return Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

/** Drop plays no sane player makes: Upgrades into someone else's stable, Downgrades into your own. */
function sensiblePlays(state: GameState, me: PlayerId, opts: Action[]): Action[] {
  const kept = opts.filter((a) => {
    if (a.type !== 'play' || a.targetPlayer === undefined) return true;
    const t = typeOf(state, a.card);
    if (t === 'upgrade') return a.targetPlayer === me;
    if (t === 'downgrade') return a.targetPlayer !== me;
    return true;
  });
  return kept.length ? kept : opts;
}

export function greedyBotAction(state: GameState, me: PlayerId, rand: () => number): Action | null {
  // what it may *do* comes from the real game; what it may *know* while weighing those options does not
  const opts = sensiblePlays(state, me, legalActions(state, me));
  if (opts.length === 0) return null;
  const world = determinize(state, me, rand);
  const pend = state.pending;
  if (pend && pend.kind === 'neighWindow') {
    const pass = opts.find((a) => a.type === 'pass')!;
    const neighs = opts.filter((a) => a.type === 'neigh');
    if (neighs.length === 0) return pass;
    const vPass = score(settle(world, me, pass, rand), me);
    // if I Neigh, the card is (most likely) cancelled: compare against the state as it stands
    const vNeigh = score(world, me) - 2.5;
    return vNeigh > vPass ? neighs[0]! : pass;
  }
  return bestOf(world, me, opts, rand);
}
