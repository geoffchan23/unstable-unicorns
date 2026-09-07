import { describe, it, expect } from 'vitest';
import { setup as base, type SetupOptions } from './harness';
import { unicornCount } from '../queries';

const setup = (o: SetupOptions = {}) => base({ plays: 9, ...o });
/** start with P2 about to take their turn (P1 draws as their action). */
const p2turn = (o: SetupOptions = {}) => { const h = base({ ...o, plays: 1 }); h.draw(0); return h; };

describe('Upgrades', () => {
  it('Glitter Bomb: sacrifice a card to destroy a card', () => {
    const h = p2turn({ stables: [['basic-unicorn-red'], ['glitter-bomb', 'basic-unicorn-blue']] });
    expect(h.prompt()?.message).toMatch(/Glitter Bomb/);
    h.answerCard('basic-unicorn-blue').answerCard('basic-unicorn-red');
    expect(h.stable(0)).not.toContain('basic-unicorn-red');
    expect(h.stable(1)).not.toContain('basic-unicorn-blue');
  });

  it('Rainbow Aura: your unicorns cannot be destroyed (but can be sacrificed)', () => {
    const h = setup({ stables: [[], ['rainbow-aura', 'basic-unicorn-red']], hands: [['unicorn-poison', 'extremely-destructive-unicorn']] });
    h.play(0, 'unicorn-poison').answerCard('basic-unicorn-red');
    expect(h.stable(1)).toContain('basic-unicorn-red');
    h.play(0, 'extremely-destructive-unicorn').answerCard('extremely-destructive-unicorn').answerCard('basic-unicorn-red').autoAnswer();
    expect(h.stable(1)).not.toContain('basic-unicorn-red');
  });

  it('Double Dutch: two plays, or a draw', () => {
    const h = p2turn({ stables: [[], ['double-dutch']], hands: [[], ['basic-unicorn-red', 'basic-unicorn-blue']] });
    expect(h.state.turn.playsRemaining).toBe(2);
    h.play(1, 'basic-unicorn-red');
    expect(h.state.turn.player).toBe(1);
    h.play(1, 'basic-unicorn-blue');
    expect(h.state.turn.player).toBe(2);
  });

  it('Claw Machine: discard to draw', () => {
    // deck top: P1's draw action, then Claw Machine's draw, then P2's draw phase
    const h = p2turn({ stables: [[], ['claw-machine']], hands: [[], ['neigh']], deckTop: ['yay', 'slowdown', 'good-deal'] });
    h.yes().answerCard('neigh');
    expect(h.hand(1)).toEqual(['slowdown', 'good-deal']);
    expect(h.discard()).toEqual(['neigh']);
  });

  it('Stable Artillery: discard 2 to destroy a unicorn', () => {
    const h = p2turn({ stables: [['basic-unicorn-red'], ['stable-artillery']], hands: [[], ['neigh', 'neigh']] });
    h.yes().answerCard('neigh').answerCard('neigh').answerCard('basic-unicorn-red');
    expect(h.stable(0)).not.toContain('basic-unicorn-red');
  });

  it('Rainbow Lasso: discard 3 to steal a unicorn', () => {
    const h = p2turn({ stables: [['basic-unicorn-red'], ['rainbow-lasso']], hands: [[], ['neigh', 'neigh', 'neigh']] });
    h.yes().answerCard('neigh').answerCard('neigh').answerCard('neigh').answerCard('basic-unicorn-red');
    expect(h.stable(1)).toContain('basic-unicorn-red');
  });

  it('Caffeine Overload: sacrifice to draw 2', () => {
    const h = p2turn({ stables: [[], ['caffeine-overload', 'basic-unicorn-red']], deckTop: ['neigh', 'slowdown', 'good-deal', 'yay'] });
    h.answerCard('basic-unicorn-red');
    expect(h.hand(1)).toEqual(['slowdown', 'good-deal', 'yay']);
  });

  it('Broken Stable: cannot play upgrades', () => {
    const h = setup({ stables: [['broken-stable']], hands: [['yay', 'basic-unicorn-red']] });
    const plays = h.legal(0).filter((a) => a.type === 'play').map((a) => h.state.cards[(a as { card: number }).card]!.def);
    expect(plays).toEqual(['basic-unicorn-red']);
  });
});

describe('Downgrades', () => {
  it('Barbed Wire: discard whenever a unicorn enters or leaves', () => {
    const h = setup({ stables: [['barbed-wire']], hands: [['basic-unicorn-red', 'neigh', 'neigh']] });
    h.play(0, 'basic-unicorn-red').answerCard('neigh');
    expect(h.hand(0)).toEqual(['neigh']);
    h.state.players[1]!.hand.push(h.state.deck.pop()!);
    // now P2 destroys it: another discard
    const poison = Object.values(h.state.cards).find((c) => c.def === 'unicorn-poison')!.id;
    h.state.deck = h.state.deck.filter((c) => c !== poison);
    h.state.players[0]!.hand.push(poison);
    h.play(0, 'unicorn-poison').answerCard('basic-unicorn-red').answerCard('neigh');
    expect(h.hand(0)).toEqual([]);
  });

  it('Sadistic Ritual: mandatory sacrifice then draw', () => {
    const h = p2turn({ stables: [[], ['sadistic-ritual', 'basic-unicorn-red']], deckTop: ['neigh', 'slowdown', 'good-deal'] });
    h.answerCard('basic-unicorn-red');
    expect(h.stable(1)).not.toContain('basic-unicorn-red');
    expect(h.hand(1)).toEqual(['slowdown', 'good-deal']);
  });

  it('Nanny Cam: hand visible in the view', async () => {
    const { viewFor } = await import('../view');
    const h = setup({ stables: [[], ['nanny-cam']], hands: [[], ['neigh']] });
    const v = viewFor(h.state, 0);
    expect(v.players[1]!.hand).not.toBeNull();
    expect(v.players[2]!.hand).toBeNull();
  });

  it('Blinding Light: unicorn effects are ignored, Ginormous counts 1, babies still go to the nursery', () => {
    const h = setup({ stables: [[], ['blinding-light', 'ginormous-unicorn', 'stabby-the-unicorn']], hands: [['unicorn-poison', 'unicorn-poison']] });
    expect(unicornCount(h.state, 1)).toBe(3);
    h.play(0, 'unicorn-poison').answerCard('stabby-the-unicorn');
    expect(h.prompt()).toBeNull(); // Stabby's trigger did not fire
    const n = h.nursery().length;
    h.play(0, 'unicorn-poison').answerCard(h.stable(1)[0]!);
    expect(h.nursery().length).toBe(n + 1);
  });
  it('Blinding Light: on-enter effects of arriving unicorns are ignored', () => {
    const h = setup({ stables: [['blinding-light']], hands: [['greedy-flying-unicorn']] });
    h.play(0, 'greedy-flying-unicorn');
    expect(h.hand(0)).toEqual([]);
  });

  it('Pandamonium: pandas cannot be targeted as unicorns and count 0 toward winning', () => {
    const h = setup({ stables: [[], ['pandamonium', 'basic-unicorn-red']], hands: [['unicorn-poison', 'two-for-one']] });
    expect(unicornCount(h.state, 1)).toBe(0);
    h.play(0, 'unicorn-poison');
    const options = h.defs(h.prompt()!.options as number[]);
    expect(options).not.toContain('basic-unicorn-red');
    expect(options.length).toBe(2); // P1's and P3's babies
  });
  it('Pandamonium: "a card" effects still hit pandas', () => {
    const h = setup({ stables: [['slowdown'], ['pandamonium', 'basic-unicorn-red']], hands: [['two-for-one']] });
    h.play(0, 'two-for-one').answerCard('slowdown').answerCard('basic-unicorn-red').answerCard('pandamonium');
    expect(h.stable(1)).toEqual([h.stable(1)[0]]);
  });

  it('Tiny Stable: more than 5 unicorns forces a sacrifice, Ginormous counts 2', () => {
    const h = setup({ stables: [['tiny-stable', 'ginormous-unicorn', 'basic-unicorn-red', 'basic-unicorn-blue']], hands: [['basic-unicorn-green']] });
    expect(unicornCount(h.state, 0)).toBe(5);
    h.play(0, 'basic-unicorn-green');
    expect(h.prompt()?.message).toMatch(/Tiny Stable/);
    h.answerCard('basic-unicorn-green');
    expect(unicornCount(h.state, 0)).toBe(5);
  });
});
