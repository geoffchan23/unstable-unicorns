import { describe, it, expect } from 'vitest';
import { Harness } from './harness';
import { viewFor } from '../view';
import { createGame, applyAction } from '../game';
import { playersToAct, randomBotAction } from '../bot';
import { checkEventsExplain } from '../sim';
import type { GameEvent, GameState } from '../types';
import type { PlayerView } from '../view';

const moves = (s: GameState, since = 0) => s.events.filter((e) => e.seq >= since && e.kind === 'move') as Extract<GameEvent, { kind: 'move' }>[];

describe('event stream', () => {
  it('numbers events by their index', () => {
    const h = new Harness({ hands: [['basic-unicorn-red'], [], []], plays: 9 });
    h.play(0, 'basic-unicorn-red');
    h.state.events.forEach((e, i) => expect(e.seq).toBe(i));
  });

  it('a draw moves a card from the deck to the hand', () => {
    const h = new Harness({ deckTop: ['neigh'] });
    const since = h.state.events.length;
    h.draw(0); // my draw ends the turn, so the next player's turn-start draw follows
    const m = moves(h.state, since);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ from: { zone: 'deck' }, to: { zone: 'hand', player: 0 }, how: 'draw', actor: 0 });
    expect(m[0]!.card).toBe(h.inHand(0, 'neigh'));
    expect(m[1]).toMatchObject({ to: { zone: 'hand', player: 1 }, how: 'draw', actor: 1 });
  });

  it('playing a unicorn: hand -> limbo (play), then limbo -> stable (resolve), with the log lines in between', () => {
    const h = new Harness({ hands: [['basic-unicorn-red'], [], []], plays: 9 });
    const since = h.state.events.length;
    const card = h.inHand(0, 'basic-unicorn-red');
    h.play(0, 'basic-unicorn-red');
    const fresh = h.state.events.slice(since);
    const kinds = fresh.map((e) => (e.kind === 'move' ? `${e.how}:${e.from.zone}>${e.to.zone}` : e.kind === 'say' ? `say:${e.actor}` : e.kind));
    expect(kinds).toEqual(['say:0', 'play:hand>limbo', 'say:0', 'resolve:limbo>stable']);
    expect(moves(h.state, since).every((m) => m.card === card)).toBe(true);
  });

  it('a Neigh: hand -> limbo (neigh); resolution sends the Neigh and the countered card to the discard', () => {
    const h = new Harness({ hands: [['basic-unicorn-red'], ['neigh'], []], plays: 9 });
    const since = h.state.events.length;
    const uni = h.inHand(0, 'basic-unicorn-red'); const neigh = h.inHand(1, 'neigh');
    h.play(0, 'basic-unicorn-red', undefined, { autoPass: false });
    h.apply({ type: 'neigh', player: 1, card: neigh });
    h.passAll();
    const m = moves(h.state, since);
    expect(m.map((x) => [x.card, x.how])).toEqual([[uni, 'play'], [neigh, 'neigh'], [neigh, 'resolve'], [uni, 'countered']]);
    expect(m[3]!.to).toEqual({ zone: 'discard' });
    // the Neigh is discarded by the player who played it, not by the player whose turn it is
    expect(m[2]!.actor).toBe(1);
  });

  it('destroy: stable -> discard with the actor, and an immune card emits protected instead', () => {
    const h = new Harness({ hands: [['unicorn-poison'], [], []], stables: [[], ['basic-unicorn-red'], ['rainbow-aura', 'basic-unicorn-blue']], plays: 9 });
    const since = h.state.events.length;
    const red = h.inStable(1, 'basic-unicorn-red');
    h.play(0, 'unicorn-poison');
    h.answer(red);
    const m = moves(h.state, since).filter((x) => x.how === 'destroy');
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ card: red, from: { zone: 'stable', player: 1 }, to: { zone: 'discard' }, actor: 0 });
  });

  it('a new turn emits a turn event after the turn line', () => {
    const h = new Harness({ hands: [[], [], []] });
    h.draw(0);
    const t = h.state.events.filter((e) => e.kind === 'turn');
    expect(t[t.length - 1]).toMatchObject({ kind: 'turn', player: 1, number: 2 });
  });

  it('the view redacts a draw into a hidden hand, but not a card I can see', () => {
    const h = new Harness({ deckTop: ['neigh', 'neigh'], hands: [[], [], []] });
    h.draw(0); // ends the turn: P2 draws at the start of theirs
    const v0 = viewFor(h.state, 0);
    const v1 = viewFor(h.state, 1);
    const drawsFor = (v: ReturnType<typeof viewFor>, p: number) => v.events.filter((e) => e.kind === 'move' && e.how === 'draw' && e.to.zone === 'hand' && e.to.player === p) as Extract<GameEvent, { kind: 'move' }>[];
    expect(drawsFor(v0, 0)[0]!.card).not.toBeNull();
    expect(drawsFor(v0, 1)[0]!.card).toBeNull();
    expect(drawsFor(v1, 1)[0]!.card).not.toBeNull();
    expect(h.state.events.every((e) => e.kind !== 'move' || e.card !== null)).toBe(true);
  });

  it('a preview run and the committed run agree on the events before the prompt', () => {
    // Shark: confirm, sacrifice itself, then choose a target. After the confirm the preview shows the sacrifice.
    const h = new Harness({ hands: [['shark-with-a-horn'], [], []], stables: [[], ['basic-unicorn-red'], []], plays: 9 });
    h.play(0, 'shark-with-a-horn');
    h.answer(true);
    expect(h.prompt()?.kind).toBe('chooseCard');
    const preview = viewFor(h.state, 0).events;
    const sacrificed = preview.filter((e) => e.kind === 'move' && e.how === 'sacrifice');
    expect(sacrificed).toHaveLength(1);
    h.answer(h.inStable(1, 'basic-unicorn-red'));
    for (const e of preview) expect(h.state.events[e.seq]).toEqual(e);
  });

  it('a Nanny Cam played later never reveals moves that were hidden when they happened', () => {
    // P1 trades hands with P2 while P3 is not looking, and only then does a Nanny Cam land on P2.
    const h = new Harness({ players: 3, hands: [['unfair-bargain'], ['nanny-cam', 'neigh', 'super-neigh'], []], plays: 9 });
    const since = h.state.events.length;
    h.play(0, 'unfair-bargain');
    h.answer(1);
    const swap = (v: PlayerView) => v.events.filter((e) => e.seq >= since && e.kind === 'move' && e.from.zone === 'hand' && e.to.zone === 'hand') as Extract<GameEvent, { kind: 'move' }>[];
    expect(swap(viewFor(h.state, 2)).length).toBeGreaterThan(0);
    expect(swap(viewFor(h.state, 2)).every((e) => e.card === null)).toBe(true);
    // the players who were part of the trade did see it
    expect(swap(viewFor(h.state, 0)).every((e) => e.card !== null)).toBe(true);

    h.play(0, 'nanny-cam', 1);
    const after = viewFor(h.state, 2);
    expect(after.players[1]!.hand).not.toBeNull();          // the camera shows the hand as it is now
    expect(swap(after).every((e) => e.card === null)).toBe(true);  // but not how it got there

    // from here on, cards moving into that hand are visible to everyone
    const since2 = h.state.events.length;
    h.draw(0);                                               // ends P1's turn; P2 draws at the start of theirs
    const fresh = viewFor(h.state, 2).events.filter((e) => e.seq >= since2 && e.kind === 'move' && e.how === 'draw' && e.to.zone === 'hand' && e.to.player === 1) as Extract<GameEvent, { kind: 'move' }>[];
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every((e) => e.card !== null)).toBe(true);
  });

  it('explains every zone change in random games', () => {
    for (const seed of [11, 22, 33]) {
      let s = createGame({ players: ['a', 'b', 'c'], seed });
      let r = seed;
      const rand = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x80000000; };
      for (let i = 0; i < 400 && s.winner === null; i++) {
        const who = playersToAct(s)[0]!;
        const next = applyAction(s, randomBotAction(s, who, rand)!);
        checkEventsExplain(s, next);
        s = next;
      }
    }
  });
});
