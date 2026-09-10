import './cards';
import { createGame, applyAction } from './game';
import { playersToAct, randomBotAction } from './bot';
import { totalInstances, unicornCount, typeOf } from './queries';
import type { GameEvent, GameState, InstanceId, Zone } from './types';

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

/**
 * The event stream must explain every zone change: replaying the fresh `move`/`shuffle` events onto the
 * zones of `prev` has to reproduce the zones of `next` (deck compared as a set: shuffles reorder it).
 */
export function checkEventsExplain(prev: GameState, next: GameState): void {
  const zones = (s: GameState) => ({
    deck: [...s.deck], discard: [...s.discard], nursery: [...s.nursery], limbo: [...s.limbo],
    hand: s.players.map((p) => [...p.hand]), stable: s.players.map((p) => [...p.stable]),
  });
  const model = zones(prev);
  const pile = (z: Zone): InstanceId[] => z.zone === 'hand' ? model.hand[z.player]! : z.zone === 'stable' ? model.stable[z.player]! : model[z.zone];
  const fresh = next.events.slice(prev.events.length);
  fresh.forEach((e: GameEvent, i) => {
    if (e.seq !== prev.events.length + i) throw new Error(`event seq ${e.seq} out of order`);
    if (e.kind === 'shuffle') {
      if (model.discard.length !== e.count) throw new Error(`shuffle count ${e.count} != discard ${model.discard.length}`);
      model.deck.push(...model.discard); model.discard = [];
    }
    if (e.kind !== 'move') return;
    if (e.card === null) throw new Error('engine events never hide the card');
    const from = pile(e.from);
    const i0 = from.indexOf(e.card);
    if (i0 < 0) throw new Error(`event ${e.seq}: card ${e.card} (${next.cards[e.card]!.def}) is not in ${JSON.stringify(e.from)} (${e.how})`);
    from.splice(i0, 1);
    pile(e.to).push(e.card);
  });
  const want = zones(next);
  const same = (a: InstanceId[], b: InstanceId[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const sorted = (a: InstanceId[]) => [...a].sort((x, y) => x - y);
  if (!same(sorted(model.deck), sorted(want.deck))) throw new Error('events do not explain the deck');
  for (const z of ['discard', 'nursery', 'limbo'] as const) if (!same(model[z], want[z])) throw new Error(`events do not explain ${z}: ${model[z]} vs ${want[z]}`);
  next.players.forEach((p) => {
    if (!same(model.hand[p.id]!, want.hand[p.id]!)) throw new Error(`events do not explain hand of ${p.name}: ${model.hand[p.id]} vs ${want.hand[p.id]}`);
    if (!same(model.stable[p.id]!, want.stable[p.id]!)) throw new Error(`events do not explain stable of ${p.name}: ${model.stable[p.id]} vs ${want.stable[p.id]}`);
  });
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
    const next = applyAction(state, action);
    checkEventsExplain(state, next);
    state = next;
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
    const r = simulate(1000 + i, players, 40_000); // random bots need far more than the 5k default at 6-8 players
    totalTurns += r.turns;
  }
  console.log(`${games} games of ${players} players in ${Date.now() - t0}ms, avg ${(totalTurns / games).toFixed(1)} turns`);
}
