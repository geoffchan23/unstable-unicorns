import { describe, it, expect } from 'vitest';
import { seatOrder } from '../table/Seats';
import type { PlayerView } from '../../engine/view';

const view = (me: number, turn: number, n: number) => ({ me, turn: { player: turn }, players: Array.from({ length: n }, (_, id) => ({ id })) } as unknown as PlayerView);

describe('seatOrder', () => {
  it('starts at the current player and follows turn order, skipping me', () => {
    expect(seatOrder(view(0, 3, 6))).toEqual([3, 4, 5, 1, 2]);
    expect(seatOrder(view(2, 2, 4))).toEqual([3, 0, 1]);
  });
  it('shows the next players in order when it is my turn', () => {
    expect(seatOrder(view(0, 0, 4))).toEqual([1, 2, 3]);
  });
});
