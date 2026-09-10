import { describe, it, expect } from 'vitest';
import { handoffTarget } from '../handoff';

// seats: 0 human, 1 human, 2 bot
const isHuman = (p: number) => p !== 2;

describe('handoffTarget', () => {
  it('hands off to the human who must act', () => {
    expect(handoffTarget([1], isHuman, 0, 2)).toBe(1);
  });
  it('keeps the viewer when they are one of the players who may act', () => {
    expect(handoffTarget([0, 1], isHuman, 0, 2)).toBeNull();
    expect(handoffTarget([0, 1], isHuman, 1, 2)).toBeNull();
  });
  it('waits for a bot that may still act before asking anyone to pass the device', () => {
    // the reported game: Player played a card, Sprinkles (1) and the bot (2) may Neigh
    expect(handoffTarget([1, 2], isHuman, 0, 2)).toBeNull();
    // after the bot Neighs, Player (0) and Sprinkles may respond: Player is still holding the device
    expect(handoffTarget([0, 1], isHuman, 0, 2)).toBeNull();
    // Player passes: only Sprinkles is left
    expect(handoffTarget([1], isHuman, 0, 2)).toBe(1);
  });
  it('never hands off in a single-human game', () => {
    expect(handoffTarget([1], (p) => p === 1, 0, 1)).toBeNull();
  });
  it('nothing to do when only bots act', () => {
    expect(handoffTarget([2], isHuman, 0, 2)).toBeNull();
  });
});
