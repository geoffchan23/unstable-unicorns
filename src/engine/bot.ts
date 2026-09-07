import type { Action, GameState, PlayerId } from './types';
import { legalActions } from './game';

/** Which players can act right now? */
export function playersToAct(state: GameState): PlayerId[] {
  if (state.winner !== null) return [];
  const p = state.pending;
  if (p) return p.kind === 'prompt' ? [p.prompt.player] : [...p.awaiting];
  return state.turn.phase === 'action' ? [state.turn.player] : [];
}

/** A uniformly random legal action for the given player, using an external RNG. */
export function randomBotAction(state: GameState, player: PlayerId, rand: () => number): Action | null {
  const acts = legalActions(state, player);
  if (acts.length === 0) return null;
  return acts[Math.floor(rand() * acts.length)]!;
}

// ---------------------------------------------------------------------------
// Greedy one-ply bot. Sees the full state (including hidden hands); good enough
// to give a human something to play against while the engine is being tested.
// ---------------------------------------------------------------------------

import { applyAction, previewState } from './game';
import { unicornCount } from './queries';

function score(state: GameState, me: PlayerId): number {
  if (state.winner === me) return 1e6;
  if (state.winner !== null) return -1e6;
  const mine = unicornCount(state, me);
  let best = 0;
  for (const p of state.players) if (p.id !== me) best = Math.max(best, unicornCount(state, p.id));
  const hand = state.players[me]!.hand.length;
  const stable = state.players[me]!.stable.length;
  return mine * 10 - best * 8 + Math.min(hand, 6) * 0.6 + stable * 0.3;
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
  for (const a of options) {
    const s = settle(state, me, a, rand, depth);
    const v = score(previewState(s), me) + rand() * 0.5;
    if (v > bestV) { bestV = v; best = a; }
  }
  return best;
}

export function greedyBotAction(state: GameState, me: PlayerId, rand: () => number): Action | null {
  const opts = legalActions(state, me);
  if (opts.length === 0) return null;
  const pend = state.pending;
  if (pend && pend.kind === 'neighWindow') {
    const pass = opts.find((a) => a.type === 'pass')!;
    const neighs = opts.filter((a) => a.type === 'neigh');
    if (neighs.length === 0) return pass;
    const vPass = score(settle(state, me, pass, rand), me);
    // if I Neigh, the card is (most likely) cancelled: compare against the state as it stands
    const vNeigh = score(state, me) - 2.5;
    return vNeigh > vPass ? neighs[0]! : pass;
  }
  return bestOf(state, me, opts, rand);
}
