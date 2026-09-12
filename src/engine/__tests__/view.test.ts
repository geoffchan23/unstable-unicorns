import { Harness } from './harness';
import { viewFor } from '../view';

describe('viewFor', () => {
  it('hides other hands, exposes deck count and unicorn counts', () => {
    const h = new Harness({ players: 3, hands: [['neigh', 'neigh'], ['neigh'], []], stables: [['rainbow-unicorn'], [], []] });
    const v = viewFor(h.state, 0);
    expect(v.me).toBe(0);
    expect(v.players[0]!.hand).toHaveLength(2);
    expect(v.players[1]!.hand).toBeNull();
    expect(v.players[1]!.handCount).toBe(1);
    expect(v.deckCount).toBe(h.state.deck.length);
    // baby + rainbow for player 0, baby only for the others
    expect(v.unicornCounts).toEqual([2, 1, 1]);
    expect((v as unknown as { deck?: unknown }).deck).toBeUndefined();
  });

  it('tells me why a hand card cannot be played', () => {
    const h = new Harness({ players: 2, hands: [['basic-unicorn-red', 'rainbow-aura', 'neigh'], []], stables: [['broken-stable'], ['queen-bee-unicorn']], babies: false, twoPlayerVariant: false });
    const v = viewFor(h.state, 0);
    const red = h.inHand(0, 'basic-unicorn-red'); const aura = h.inHand(0, 'rainbow-aura'); const neigh = h.inHand(0, 'neigh');
    expect(v.playBlocks[red]).toBe("P2's Queen Bee Unicorn: Basic Unicorns cannot enter any other stable");
    expect(v.playBlocks[aura]).toBe('Broken Stable: you cannot play Upgrade cards');
    expect(v.playBlocks[neigh]).toBeUndefined();
  });
});

describe('an open hand', () => {
  it('tells every player whose hand is face up, so the table can say where to look', () => {
    const h = new Harness({ players: 3, stables: [[], ['nanny-cam'], []], hands: [['neigh'], ['neigh', 'neigh'], []] });
    const open = (me: number) => viewFor(h.state, me).players.map((p) => p.handOpen);
    expect(open(0)).toEqual([false, true, false]);
    expect(open(1)).toEqual([false, true, false]);   // including the player it is attached to
    // and the cards really are readable by everyone else
    expect(viewFor(h.state, 0).players[1]!.hand).toHaveLength(2);
    expect(viewFor(h.state, 0).players[2]!.hand).toBeNull();
  });
});
