import { describe, it, expect } from 'vitest';
import { setup as base, type SetupOptions } from './harness';

const setup = (o: SetupOptions = {}) => base({ plays: 9, ...o });

describe('Magic cards', () => {
  it('Unicorn Poison destroys a unicorn', () => {
    const h = setup({ stables: [[], ['basic-unicorn-red']], hands: [['unicorn-poison']] });
    h.play(0, 'unicorn-poison').answerCard('basic-unicorn-red');
    expect(h.stable(1)).not.toContain('basic-unicorn-red');
    expect(h.discard().sort()).toEqual(['basic-unicorn-red', 'unicorn-poison']);
  });

  it('Back Kick returns a card and forces a discard', () => {
    const h = setup({ stables: [[], ['slowdown']], hands: [['back-kick'], ['neigh']] });
    h.play(0, 'back-kick').answer(1).answerCard('slowdown');
    // P2 now holds slowdown + neigh and must discard one
    expect(h.prompt()?.player).toBe(1);
    h.answerCard('neigh');
    expect(h.hand(1)).toEqual(['slowdown']);
  });

  it('Change of Luck: draw 2, discard 3, extra turn', () => {
    const h = setup({ hands: [['change-of-luck', 'neigh']], deckTop: ['good-deal', 'slowdown'], plays: 1 });
    h.play(0, 'change-of-luck').answerCard('neigh').answerCard('good-deal').answerCard('slowdown');
    expect(h.hand(0).length).toBe(1); // drew 1 in the new turn's draw phase
    expect(h.state.turn.player).toBe(0);
    expect(h.state.turn.number).toBe(2);
  });
  it('Change of Luck with fewer than 3 cards discards what it can', () => {
    const h = setup({ hands: [['change-of-luck']], deckTop: ['good-deal', 'slowdown'] });
    h.play(0, 'change-of-luck').answerCard('good-deal').answerCard('slowdown');
    expect(h.hand(0)).toEqual([]);
    expect(h.prompt()).toBeNull();
  });

  it('Glitter Tornado: the player chooses a card from every stable, babies go to the nursery', () => {
    const h = setup({ stables: [['slowdown'], ['basic-unicorn-red'], []], hands: [['glitter-tornado']] });
    const n = h.nursery().length;
    h.play(0, 'glitter-tornado').answerCard('slowdown').answerCard('basic-unicorn-red').answerCard(h.stable(2)[0]!);
    expect(h.hand(0)).toContain('slowdown');
    expect(h.hand(1)).toEqual(['basic-unicorn-red']);
    expect(h.stable(2)).toEqual([]);
    expect(h.nursery().length).toBe(n + 1);
  });

  it('Unicorn Swap: move then steal', () => {
    const h = setup({ stables: [['basic-unicorn-red'], ['basic-unicorn-blue']], hands: [['unicorn-swap']] });
    h.play(0, 'unicorn-swap').answerCard('basic-unicorn-red').answer(1).answerCard('basic-unicorn-blue');
    expect(h.stable(0)).toContain('basic-unicorn-blue');
    expect(h.stable(1)).toContain('basic-unicorn-red');
  });

  it('Re-Target moves an upgrade or downgrade', () => {
    const h = setup({ stables: [['slowdown'], []], hands: [['re-target']] });
    h.play(0, 're-target').answerCard('slowdown').answer(1);
    expect(h.stable(1)).toContain('slowdown');
    expect(h.stable(0)).not.toContain('slowdown');
  });

  it('Unfair Bargain trades hands', () => {
    const h = setup({ hands: [['unfair-bargain', 'neigh'], ['good-deal', 'slowdown']] });
    h.play(0, 'unfair-bargain').answer(1);
    expect(h.hand(0).sort()).toEqual(['good-deal', 'slowdown']);
    expect(h.hand(1)).toEqual(['neigh']);
  });

  it('Two-For-One: sacrifice one, destroy two (any stable cards, different players)', () => {
    const h = setup({ stables: [['slowdown'], ['yay'], ['basic-unicorn-red']], hands: [['two-for-one']] });
    h.play(0, 'two-for-one').answerCard('slowdown').answerCard('yay').answerCard('basic-unicorn-red');
    expect(h.stable(1)).not.toContain('yay');
    expect(h.stable(2)).not.toContain('basic-unicorn-red');
    expect(h.discard()).toContain('slowdown');
  });

  it('Targeted Destruction: destroy an upgrade or sacrifice a downgrade', () => {
    const h = setup({ stables: [['nanny-cam'], ['yay']], hands: [['targeted-destruction']] });
    h.play(0, 'targeted-destruction').answerCard('nanny-cam');
    expect(h.stable(0)).not.toContain('nanny-cam');
  });

  it('Mystical Vortex: everyone discards, then the discard pile (not Vortex itself) is shuffled in', () => {
    const h = setup({ hands: [['mystical-vortex', 'neigh'], ['good-deal'], []], discard: ['slowdown'] });
    const deck = h.deckSize();
    h.play(0, 'mystical-vortex').answerCard('neigh').answerCard('good-deal');
    expect(h.discard()).toEqual(['mystical-vortex']);
    expect(h.deckSize()).toBe(deck + 3);
  });

  it('Good Deal: draw 3 discard 1', () => {
    const h = setup({ hands: [['good-deal']], deckTop: ['neigh', 'slowdown', 'yay'] });
    h.play(0, 'good-deal').answerCard('neigh');
    expect(h.hand(0).sort()).toEqual(['slowdown', 'yay']);
  });

  it('Shake Up: hand, discard pile, and itself go into the deck; draw 5', () => {
    const h = setup({ hands: [['shake-up', 'neigh', 'neigh']], discard: ['slowdown'] });
    const total = h.deckSize() + 4;
    h.play(0, 'shake-up');
    expect(h.hand(0).length).toBe(5);
    expect(h.discard()).toEqual([]);
    expect(h.deckSize()).toBe(total - 5);
  });

  it('Blatant Thievery: look at a hand and take a card', () => {
    const h = setup({ hands: [['blatant-thievery'], ['good-deal', 'neigh']] });
    h.play(0, 'blatant-thievery').answerCard('good-deal'); // only P2 has cards: no player prompt
    expect(h.hand(0)).toEqual(['good-deal']);
    expect(h.hand(1)).toEqual(['neigh']);
  });

  it('Reset Button: everyone sacrifices upgrades and downgrades; discard shuffled in', () => {
    const h = setup({ stables: [['yay'], ['slowdown', 'basic-unicorn-red']], hands: [['reset-button']] });
    h.play(0, 'reset-button');
    expect(h.stable(0)).not.toContain('yay');
    expect(h.stable(1)).toEqual([h.stable(1)[0], 'basic-unicorn-red']);
    expect(h.discard()).toEqual(['reset-button']);
  });

  it('Kiss of Life: revive a unicorn from the discard pile', () => {
    const h = setup({ hands: [['kiss-of-life']], discard: ['basic-unicorn-red'] });
    h.play(0, 'kiss-of-life').answerCard('basic-unicorn-red');
    expect(h.stable(0)).toContain('basic-unicorn-red');
  });
});
