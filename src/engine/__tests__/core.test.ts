import { describe, it, expect } from 'vitest';
import { setup } from './harness';
import { IllegalAction } from '../game';
import { unicornCount } from '../queries';

const COLOURS = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'purple'];
/** n distinct-ish Basic Unicorn def ids (3 copies of each colour exist). */
export const basics = (n: number) => Array.from({ length: n }, (_, i) => `basic-unicorn-${COLOURS[i % 7]}`);

describe('turn structure', () => {
  it('play a unicorn: it enters the stable and the action is spent', () => {
    const h = setup({ hands: [['basic-unicorn-red']] });
    h.play(0, 'basic-unicorn-red');
    expect(h.stable(0)).toContain('basic-unicorn-red');
    // action spent -> end phase -> next player's turn
    expect(h.state.turn.player).toBe(1);
    expect(h.state.turn.phase).toBe('action');
  });

  it('draw as the action gives one card and ends the turn', () => {
    const h = setup({ hands: [[]], deckTop: ['good-deal'] });
    h.draw(0);
    expect(h.hand(0)).toEqual(['good-deal']);
    expect(h.state.turn.player).toBe(1);
  });

  it('the next player draws a card in their draw phase', () => {
    const h = setup({ hands: [[]], deckTop: ['unicorn-poison', 'good-deal'] });
    h.draw(0);
    expect(h.hand(1)).toEqual(['good-deal']);
  });

  it('discards down to 7 at end of turn', () => {
    const h = setup({ hands: [Array(9).fill('neigh')] });
    h.draw(0); // 10 cards
    expect(h.prompt()?.message).toMatch(/Discard down/);
    h.answerCard('neigh').answerCard('neigh').answerCard('neigh');
    expect(h.hand(0).length).toBe(7);
    expect(h.state.turn.player).toBe(1);
  });

  it('rejects out-of-turn plays', () => {
    const h = setup({ hands: [[], ['basic-unicorn-red']] });
    expect(() => h.play(1, 'basic-unicorn-red')).toThrow(IllegalAction);
  });

  it('cannot play Neigh as an action', () => {
    const h = setup({ hands: [['neigh']] });
    expect(() => h.play(0, 'neigh')).toThrow(IllegalAction);
    expect(h.legal(0).some((a) => a.type === 'play')).toBe(false);
  });

  it('reshuffles the discard pile when the deck runs out', () => {
    const h = setup({ hands: [[]], discard: ['good-deal', 'unicorn-poison'] });
    h.state.deck = [];
    h.draw(0);
    expect(h.hand(0).length).toBe(1);
    expect(h.hand(1).length).toBe(1); // P2's draw phase took the other one
    expect(h.deckSize() + h.discard().length).toBe(0);
  });
});

describe('winning', () => {
  it('wins immediately on reaching 7 unicorns', () => {
    const h = setup({ stables: [basics(5)], hands: [['basic-unicorn-blue']] });
    h.play(0, 'basic-unicorn-blue');
    expect(h.state.winner).toBe(0);
  });
  it('6-8 players need only 6', () => {
    const h = setup({ players: 6, stables: [basics(4)], hands: [['basic-unicorn-purple']] });
    expect(h.state.unicornsToWin).toBe(6);
    h.play(0, 'basic-unicorn-purple');
    expect(h.state.winner).toBe(0);
  });

  it('can win on another player\'s turn', () => {
    const h = setup({ stables: [['basic-unicorn-red'], basics(5).map((b) => b.replace('red', 'purple'))], hands: [['unicorn-swap']] });
    // P1 gives a unicorn to P2 -> P2 has 7 before the steal-back happens; the rest of the swap is moot
    h.play(0, 'unicorn-swap').answerCard('basic-unicorn-red').answer(1);
    expect(h.state.winner).toBe(1);
    expect(h.stable(1)).toContain('basic-unicorn-red');
    expect(h.prompt()).toBeNull();
  });
});

describe('Neigh stack', () => {
  it('a Neigh cancels the card; the action is still spent', () => {
    const h = setup({ hands: [['basic-unicorn-red'], ['neigh']] });
    h.play(0, 'basic-unicorn-red', undefined, { autoPass: false });
    expect(h.neighWindow()?.awaiting).toEqual([1, 2]);
    h.neigh(1).passAll();
    expect(h.discard().sort()).toEqual(['basic-unicorn-red', 'neigh']);
    expect(h.stable(0)).not.toContain('basic-unicorn-red');
    expect(h.state.turn.player).toBe(1);
  });

  it('a Neigh on a Neigh lets the card through', () => {
    const h = setup({ hands: [['basic-unicorn-red', 'neigh'], ['neigh']] });
    h.play(0, 'basic-unicorn-red', undefined, { autoPass: false });
    h.neigh(1);
    expect(h.neighWindow()?.awaiting).toEqual([0, 2]);
    h.neigh(0).passAll();
    expect(h.stable(0)).toContain('basic-unicorn-red');
    expect(h.discard().filter((d) => d === 'neigh').length).toBe(2);
  });

  it('Super Neigh cannot be answered', () => {
    const h = setup({ hands: [['basic-unicorn-red', 'neigh'], ['super-neigh']] });
    h.play(0, 'basic-unicorn-red', undefined, { autoPass: false });
    h.neigh(1, 'super-neigh');
    expect(h.neighWindow()).toBeNull();
    expect(h.discard()).toContain('basic-unicorn-red');
  });

  it('Yay: cards you play cannot be Neigh\'d', () => {
    const h = setup({ stables: [['yay']], hands: [['basic-unicorn-red'], ['neigh']] });
    h.play(0, 'basic-unicorn-red', undefined, { autoPass: false });
    expect(h.neighWindow()).toBeNull();
    expect(h.stable(0)).toContain('basic-unicorn-red');
  });

  it('Slowdown: you cannot play Neigh cards', () => {
    const h = setup({ stables: [[], ['slowdown']], hands: [['basic-unicorn-red'], ['neigh']] });
    h.play(0, 'basic-unicorn-red', undefined, { autoPass: false });
    expect(h.neighWindow()?.awaiting).toEqual([2]);
  });

  it('Ginormous Unicorn: its owner cannot play Neighs and it counts as 2', () => {
    const h = setup({ stables: [[], ['ginormous-unicorn']], hands: [['basic-unicorn-red'], ['neigh']] });
    h.play(0, 'basic-unicorn-red', undefined, { autoPass: false });
    expect(h.neighWindow()?.awaiting).toEqual([2]);
    expect(h.state.players[1]!.stable.length).toBe(2);
    expect(unicornCount(h.state, 1)).toBe(3);
  });

  it('a Neigh\'d Magic card has no effect', () => {
    const h = setup({ hands: [['unicorn-poison'], ['neigh']], stables: [[], ['basic-unicorn-red']] });
    h.play(0, 'unicorn-poison', undefined, { autoPass: false }).neigh(1).passAll();
    expect(h.stable(1)).toContain('basic-unicorn-red');
    expect(h.prompt()).toBeNull();
  });
});
