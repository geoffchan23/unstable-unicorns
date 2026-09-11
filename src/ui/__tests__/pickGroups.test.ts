import { describe, it, expect } from 'vitest';
import { groupByOwner } from '../pickGroups';
import type { PlayerView } from '../../engine/view';

const view = {
  me: 1,
  players: [
    { id: 0, name: 'Sprinkles', stable: [10, 11], hand: null },
    { id: 1, name: 'Player', stable: [20], hand: [30, 31] },
    { id: 2, name: 'Glitterhoof', stable: [40], hand: null },
  ],
  discard: [50],
  nursery: [60],
} as unknown as PlayerView;

describe('groupByOwner', () => {
  it('puts each player\'s cards under their own heading, in the order they were offered', () => {
    const groups = groupByOwner([10, 40, 11, 20], view);
    expect(groups.map((g) => [g.label, g.ids])).toEqual([
      ["Sprinkles's stable", [10, 11]],
      ["Glitterhoof's stable", [40]],
      ['Your stable', [20]],
    ]);
    expect(groups.map((g) => g.mine)).toEqual([false, false, true]);
  });

  it('separates a hand from a stable, and names the shared piles', () => {
    const groups = groupByOwner([30, 20, 50, 60], view);
    expect(groups.map((g) => g.label)).toEqual(['Your hand', 'Your stable', 'The discard pile', 'The Nursery']);
  });

  it('calls anything it cannot place the deck (a card being searched for is not in a visible zone)', () => {
    expect(groupByOwner([99], view).map((g) => g.label)).toEqual(['The deck']);
  });
});
