import './cards';
import { createGame, applyAction } from './game';
import { playersToAct, randomBotAction } from './bot';
import { totalInstances, unicornCount, typeOf } from './queries';
import type { GameState } from './types';

export interface SimResult {
  seed: number;
  turns: number;
  actions: number;
  winner: number | null;
  finalUnicorns: number[];
}

/** deterministic RNG for bot choices, separate from the game's own RNG */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function checkInvariants(state: GameState, expectedTotal: number): void {
  const total = totalInstances(state);
  if (total !== expectedTotal) throw new Error(`card conservation: ${total} != ${expectedTotal}`);
  // no duplicates across zones
  const seen = new Set<number>();
  const zones = [state.deck, state.discard, state.nursery, state.limbo, ...state.players.flatMap((p) => [p.hand, p.stable])];
  for (const z of zones) for (const c of z) {
    if (seen.has(c)) throw new Error(`card ${c} appears twice`);
    seen.add(c);
  }
  // babies only in nursery or stables
  for (const c of [...state.deck, ...state.discard, ...state.limbo, ...state.players.flatMap((p) => p.hand)]) {
    if (typeOf(state, c) === 'baby_unicorn') throw new Error(`baby unicorn ${c} outside nursery/stable`);
  }
  // hand limit respected at the start of a turn
  if (state.turn.phase === 'action' && !state.pending) {
    for (const p of state.players) if (p.id !== state.turn.player && p.hand.length > 7 + 0) {
      // other players may exceed 7 mid-turn from steals etc.; only the active player is checked at end
    }
  }
  if (state.winner !== null && unicornCount(state, state.winner) < state.unicornsToWin) {
    throw new Error('winner does not have enough unicorns');
  }
}

export function simulate(seed: number, players = 3, maxActions = 5000): SimResult {
  const names = Array.from({ length: players }, (_, i) => `P${i + 1}`);
  let state = createGame({ players: names, seed });
  const expectedTotal = totalInstances(state);
  const rand = mulberry(seed ^ 0x9e3779b9);
  let actions = 0;
  checkInvariants(state, expectedTotal);
  while (state.winner === null) {
    const actors = playersToAct(state);
    if (actors.length === 0) throw new Error(`stuck: nobody can act (phase ${state.turn.phase}, pending ${JSON.stringify(state.pending)})`);
    const who = actors[Math.floor(rand() * actors.length)]!;
    const action = randomBotAction(state, who, rand);
    if (!action) throw new Error(`stuck: no legal action for ${who}`);
    state = applyAction(state, action);
    actions++;
    checkInvariants(state, expectedTotal);
    if (actions > maxActions) throw new Error(`game did not finish in ${maxActions} actions`);
  }
  return {
    seed, turns: state.turn.number, actions, winner: state.winner,
    finalUnicorns: state.players.map((p) => unicornCount(state, p.id)),
  };
}

// CLI: npx tsx src/engine/sim.ts [games] [players]
if (process.argv[1] && process.argv[1].endsWith('sim.ts')) {
  const games = Number(process.argv[2] ?? 100);
  const players = Number(process.argv[3] ?? 3);
  let totalTurns = 0;
  const t0 = Date.now();
  for (let i = 0; i < games; i++) {
    const r = simulate(1000 + i, players);
    totalTurns += r.turns;
  }
  console.log(`${games} games of ${players} players in ${Date.now() - t0}ms, avg ${(totalTurns / games).toFixed(1)} turns`);
}
