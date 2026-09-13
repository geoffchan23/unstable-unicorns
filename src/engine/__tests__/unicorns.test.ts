import { describe, it, expect } from 'vitest';
import { setup as base, type SetupOptions } from './harness';
import { unicornCount } from '../queries';
import { viewFor } from '../view';

/** card tests: give the active player plenty of actions so the turn does not advance. */
const setup = (o: SetupOptions = {}) => base({ plays: 9, ...o });

describe('Baby Unicorns', () => {
  it('go back to the Nursery instead of the discard pile when destroyed', () => {
    const h = setup({ hands: [['unicorn-poison']] });
    const before = h.nursery().length;
    h.play(0, 'unicorn-poison').answerCard(h.stable(1)[0]!);
    expect(h.stable(1)).toEqual([]);
    expect(h.nursery().length).toBe(before + 1);
    expect(h.discard()).toEqual(['unicorn-poison']);
  });
  it('go back to the Nursery when returned to hand', () => {
    const h = setup({ hands: [['back-kick']], stables: [[], []] });
    const before = h.nursery().length;
    h.play(0, 'back-kick').answer(1).answerCard(h.stable(1)[0]!);
    expect(h.nursery().length).toBe(before + 1);
    expect(h.hand(1)).toEqual([]);
  });
});

describe('Magical Unicorns', () => {
  it('Rhinocorn: destroy a unicorn at start of turn, then end the turn (no draw, no action)', () => {
    const h = setup({ stables: [[], ['rhinocorn']], hands: [[]] });
    h.draw(0).useBegin('rhinocorn'); // P1's turn ends, P2 begins and uses Rhinocorn
    expect(h.prompt()?.message).toMatch(/Rhinocorn/);
    const handBefore = h.hand(1).length;
    h.answerCard(h.stable(0)[0]!);
    expect(h.stable(0)).toEqual([]);
    expect(h.hand(1).length).toBe(handBefore); // no draw phase
    expect(h.state.turn.player).toBe(2);
  });
  it('Rhinocorn: declining keeps the turn normal', () => {
    const h = setup({ stables: [[], ['rhinocorn']], hands: [[]] });
    h.draw(0).skipBegin();
    expect(h.state.turn.player).toBe(1);
    expect(h.state.turn.phase).toBe('action');
  });

  it('Magical Kittencorn can be destroyed by a Unicorn effect', () => {
    const h = setup({ stables: [[], ['magical-kittencorn']], hands: [['shark-with-a-horn']] });
    h.play(0, 'shark-with-a-horn').yes().answerCard('magical-kittencorn');
    expect(h.stable(1)).not.toContain('magical-kittencorn');
  });
  it('Magical Kittencorn: Unicorn Poison targeting it fails', () => {
    const h = setup({ stables: [[], ['magical-kittencorn']], hands: [['unicorn-poison']] });
    h.play(0, 'unicorn-poison').answerCard('magical-kittencorn');
    expect(h.stable(1)).toContain('magical-kittencorn');
    expect(h.state.log.some((l) => /cannot be destroyed/.test(l.text))).toBe(true);
  });

  it('Stabby the Unicorn: destroys a unicorn when it dies', () => {
    const h = setup({ stables: [[], ['stabby-the-unicorn'], ['basic-unicorn-red']], hands: [['unicorn-poison']] });
    h.play(0, 'unicorn-poison').answerCard('stabby-the-unicorn');
    expect(h.prompt()?.player).toBe(1);
    h.answerCard('basic-unicorn-red');
    expect(h.stable(2)).not.toContain('basic-unicorn-red');
    expect(h.discard()).toContain('stabby-the-unicorn');
  });

  it('Rainbow Unicorn: brings a Basic Unicorn from hand', () => {
    const h = setup({ hands: [['rainbow-unicorn', 'basic-unicorn-red', 'unicorn-poison']] });
    h.play(0, 'rainbow-unicorn').answerCard('basic-unicorn-red');
    expect(h.stable(0)).toContain('basic-unicorn-red');
    expect(h.hand(0)).toEqual(['unicorn-poison']);
  });

  it('Extremely Destructive Unicorn: everyone sacrifices a unicorn, starting with its owner', () => {
    const h = setup({ stables: [[], ['basic-unicorn-red'], []], hands: [['extremely-destructive-unicorn']] });
    h.play(0, 'extremely-destructive-unicorn');
    expect(h.prompt()?.player).toBe(0);
    h.answerCard('extremely-destructive-unicorn');
    expect(h.prompt()?.player).toBe(1);
    h.answerCard('basic-unicorn-red');
    // P3 only has a baby: it goes to the nursery automatically (single option, still prompted)
    h.answerCard(h.stable(2)[0]!);
    expect(h.stable(2)).toEqual([]);
    expect(h.stable(0).length).toBe(1);
  });

  it('Chainsaw Unicorn: destroy an Upgrade or sacrifice a Downgrade', () => {
    const h = setup({ stables: [['slowdown'], ['yay']], hands: [['chainsaw-unicorn']] });
    h.play(0, 'chainsaw-unicorn').answerCard('yay');
    expect(h.stable(1)).not.toContain('yay');
  });

  it('Llamacorn: each player discards', () => {
    const h = setup({ hands: [['llamacorn', 'neigh'], ['neigh'], []] });
    h.play(0, 'llamacorn').answerCard('neigh').answerCard('neigh');
    expect(h.hand(0)).toEqual([]);
    expect(h.hand(1)).toEqual([]);
    expect(h.discard().filter((d) => d === 'neigh').length).toBe(2);
  });

  it('Americorn: pulls a random card', () => {
    const h = setup({ hands: [['americorn'], ['good-deal']] });
    h.play(0, 'americorn').answer(1);
    expect(h.hand(0)).toEqual(['good-deal']);
  });

  it('Seductive Unicorn: discard then steal', () => {
    const h = setup({ stables: [[], ['basic-unicorn-red']], hands: [['seductive-unicorn', 'neigh']] });
    h.play(0, 'seductive-unicorn').yes().answerCard('neigh').answerCard('basic-unicorn-red');
    expect(h.stable(0)).toContain('basic-unicorn-red');
    expect(h.hand(0)).toEqual([]);
  });
  it('Seductive Unicorn: no cards in hand means no steal', () => {
    const h = setup({ stables: [[], ['basic-unicorn-red']], hands: [['seductive-unicorn']] });
    h.play(0, 'seductive-unicorn');
    expect(h.prompt()).toBeNull();
    expect(h.stable(1)).toContain('basic-unicorn-red');
  });

  it('Queen Bee Unicorn: Basic Unicorns cannot enter other stables', () => {
    const h = setup({ stables: [[], ['queen-bee-unicorn']], hands: [['basic-unicorn-red', 'rainbow-unicorn']] });
    expect(h.legal(0).some((a) => a.type === 'play' && h.state.cards[a.card]!.def === 'basic-unicorn-red')).toBe(false);
    h.play(0, 'rainbow-unicorn');
    expect(h.prompt()).toBeNull(); // no legal basic to bring in
  });

  it('Flyers return to hand instead of being destroyed', () => {
    const h = setup({ stables: [[], ['greedy-flying-unicorn']], hands: [['unicorn-poison']] });
    h.play(0, 'unicorn-poison').answerCard('greedy-flying-unicorn');
    expect(h.hand(1)).toContain('greedy-flying-unicorn');
    expect(h.discard()).not.toContain('greedy-flying-unicorn');
  });
  it('Greedy Flying Unicorn draws on entering', () => {
    const h = setup({ hands: [['greedy-flying-unicorn']], deckTop: ['good-deal'] });
    h.play(0, 'greedy-flying-unicorn');
    expect(h.hand(0)).toEqual(['good-deal']);
  });
  it('Annoying Flying Unicorn makes a chosen player discard', () => {
    const h = setup({ hands: [['annoying-flying-unicorn'], ['neigh']] });
    h.play(0, 'annoying-flying-unicorn').answer(1).answerCard('neigh');
    expect(h.hand(1)).toEqual([]);
  });
  it('Magical / Swift / Majestic Flying pull from the discard pile', () => {
    const h = setup({ hands: [['magical-flying-unicorn', 'swift-flying-unicorn', 'majestic-flying-unicorn']], discard: ['good-deal', 'neigh', 'basic-unicorn-red', 'slowdown'] });
    h.play(0, 'magical-flying-unicorn').answerCard('good-deal');
    h.play(0, 'swift-flying-unicorn').answerCard('neigh');
    h.play(0, 'majestic-flying-unicorn').answerCard('basic-unicorn-red');
    expect(h.hand(0).sort()).toEqual(['basic-unicorn-red', 'good-deal', 'neigh']);
    expect(h.discard()).toEqual(['slowdown']);
  });

  it('Unicorn Phoenix: discard a card instead of dying', () => {
    const h = setup({ stables: [[], ['unicorn-phoenix']], hands: [['unicorn-poison'], ['neigh']] });
    h.play(0, 'unicorn-poison').answerCard('unicorn-phoenix');
    expect(h.prompt()?.player).toBe(1);
    h.yes().answerCard('neigh');
    expect(h.stable(1)).toContain('unicorn-phoenix');
    expect(h.hand(1)).toEqual([]);
  });
  it('Unicorn Phoenix: with an empty hand it just dies', () => {
    const h = setup({ stables: [[], ['unicorn-phoenix']], hands: [['unicorn-poison'], []] });
    h.play(0, 'unicorn-poison').answerCard('unicorn-phoenix');
    expect(h.discard()).toContain('unicorn-phoenix');
  });

  it('Unicorn on the Cob: draw 2 discard 1', () => {
    const h = setup({ hands: [['unicorn-on-the-cob']], deckTop: ['good-deal', 'neigh'] });
    h.play(0, 'unicorn-on-the-cob').answerCard('neigh');
    expect(h.hand(0)).toEqual(['good-deal']);
  });

  it('Black Knight Unicorn: sacrifice itself to save another unicorn from destroy', () => {
    const h = setup({ stables: [[], ['black-knight-unicorn', 'basic-unicorn-red']], hands: [['unicorn-poison']] });
    h.play(0, 'unicorn-poison').answerCard('basic-unicorn-red');
    expect(h.prompt()?.player).toBe(1);
    h.yes();
    expect(h.stable(1)).toContain('basic-unicorn-red');
    expect(h.discard()).toContain('black-knight-unicorn');
  });
  it('Black Knight Unicorn does not protect against sacrifice', () => {
    const h = setup({ stables: [[], ['black-knight-unicorn', 'basic-unicorn-red', 'sadistic-ritual']], hands: [[]] });
    h.draw(0).useBegin('sadistic-ritual'); // P2's begin: Sadistic Ritual
    h.answerCard('basic-unicorn-red');
    expect(h.discard()).toContain('basic-unicorn-red');
    expect(h.stable(1)).toContain('black-knight-unicorn');
  });

  it('Shark With a Horn: sacrifice itself to destroy', () => {
    const h = setup({ stables: [[], ['basic-unicorn-red']], hands: [['shark-with-a-horn']] });
    h.play(0, 'shark-with-a-horn').yes().answerCard('basic-unicorn-red');
    expect(h.stable(1)).not.toContain('basic-unicorn-red');
    expect(h.stable(0)).not.toContain('shark-with-a-horn');
  });

  it('Narwhal search cards fetch from the deck and shuffle', () => {
    const h = setup({ hands: [['shabby-the-narwhal', 'classy-narwhal', 'the-great-narwhal']] });
    h.play(0, 'shabby-the-narwhal').answerCard('slowdown');
    h.play(0, 'classy-narwhal').answerCard('yay');
    h.play(0, 'the-great-narwhal').answerCard('narwhal-torpedo');
    expect(h.hand(0).sort()).toEqual(['narwhal-torpedo', 'slowdown', 'yay']);
  });

  it('Narwhal Torpedo: sacrifices all your downgrades', () => {
    const h = setup({ stables: [['slowdown', 'nanny-cam']], hands: [['narwhal-torpedo']] });
    h.play(0, 'narwhal-torpedo');
    expect(h.stable(0)).not.toContain('slowdown');
    expect(h.stable(0)).not.toContain('nanny-cam');
  });

  it('Alluring Narwhal: steals an upgrade', () => {
    const h = setup({ stables: [[], ['yay']], hands: [['alluring-narwhal']] });
    h.play(0, 'alluring-narwhal').answerCard('yay');
    expect(h.stable(0)).toContain('yay');
  });

  it('Mermaid Unicorn: may return a card from any stable, including yours', () => {
    const h = setup({ stables: [['slowdown']], hands: [['mermaid-unicorn']] });
    h.play(0, 'mermaid-unicorn').answer(0).answerCard('slowdown');
    expect(h.hand(0)).toContain('slowdown');
  });

  it('Mother Goose Unicorn: brings a baby from the nursery', () => {
    const h = setup({ hands: [['mother-goose-unicorn']] });
    const n = h.nursery().length;
    h.play(0, 'mother-goose-unicorn').yes();
    expect(h.nursery().length).toBe(n - 1);
    expect(unicornCount(h.state, 0)).toBe(3);
  });

  it('Unicorn Oracle: look at 3, keep 1, order the rest', () => {
    const h = setup({ players: 2, hands: [['unicorn-oracle'], []], deckTop: ['good-deal', 'neigh', 'slowdown'] });
    h.play(0, 'unicorn-oracle').answerCard('neigh').answerCard('slowdown');
    expect(h.hand(0)).toEqual(['neigh']);
    expect(h.deckTop(2)).toEqual(['slowdown', 'good-deal']);
    // a private peek, unlike a search (Shabby the Narwhal etc.): the other player never learns which card it was.
    const drawsByP0 = h.state.events.filter((e) => e.kind === 'move' && e.how === 'draw' && e.actor === 0);
    const pickSeq = drawsByP0.at(-1)!.seq; // the last one is Unicorn Oracle's pick (the first is the harness's own setup draw)
    const forOther = viewFor(h.state, 1).events.find((e) => e.seq === pickSeq);
    expect(forOther).toBeDefined();
    expect((forOther as { card: unknown }).card).toBeNull();
  });

  it('Necromancer Unicorn: discard 2 unicorns, revive one (may be one just discarded)', () => {
    const h = setup({ hands: [['necromancer-unicorn', 'basic-unicorn-red', 'basic-unicorn-blue', 'basic-unicorn-green']] });
    h.play(0, 'necromancer-unicorn').yes().answerCards(['basic-unicorn-red', 'basic-unicorn-blue']).answerCard('basic-unicorn-red');
    expect(h.stable(0)).toContain('basic-unicorn-red');
    expect(h.discard()).toEqual(['basic-unicorn-blue']);
    expect(h.hand(0)).toEqual(['basic-unicorn-green']);
  });

  it('Dark Angel Unicorn: sacrifice a unicorn, revive one', () => {
    const h = setup({ stables: [['basic-unicorn-red']], hands: [['dark-angel-unicorn']], discard: ['basic-unicorn-blue'] });
    h.play(0, 'dark-angel-unicorn').answerCard('basic-unicorn-red').answerCard('basic-unicorn-blue');
    expect(h.stable(0)).toContain('basic-unicorn-blue');
    expect(h.discard()).toEqual(['basic-unicorn-red']);
  });
});
