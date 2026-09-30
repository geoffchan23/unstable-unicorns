import { describe, expect, it } from 'vitest';
import { setup } from './harness';

// See docs/RULES.md §9: "If the deck runs out of cards before any player reaches a winning
// number of Unicorns, the player with the most Unicorns wins. If tied, sum the letters in the
// names of each tied player's Unicorn cards; most letters wins. If tied again, everyone loses."
// The deck only truly "runs out" once the discard pile (which reshuffles into it) is empty too.

describe('deck exhaustion (both deck and discard empty)', () => {
  it('the player with the most Unicorns wins outright', () => {
    const h = setup({ players: 2, stables: [['basic-unicorn-red'], []], turnPlayer: 0, plays: 1 });
    h.state.deck = [];
    h.state.discard = [];
    h.draw(0);
    expect(h.state.winner).toBe(0);
  });

  it('a tie on Unicorn count is broken by the letters in the tied players’ Unicorn card names', () => {
    const h = setup({
      players: 2, babies: false,
      stables: [['baby-narwhal'], ['baby-unicorn-rainbow']], // "BabyNarwhal" (11) vs "BabyUnicornRainbow" (18)
      turnPlayer: 0, plays: 1,
    });
    h.state.deck = [];
    h.state.discard = [];
    h.draw(0);
    expect(h.state.winner).toBe(1);
  });

  it('a tie on both Unicorn count and letters means nobody wins', () => {
    const h = setup({
      players: 2, babies: false,
      stables: [['basic-unicorn-red'], ['basic-unicorn-red']],
      turnPlayer: 0, plays: 1,
    });
    h.state.deck = [];
    h.state.discard = [];
    h.draw(0);
    expect(h.state.winner).toBe('draw');
  });

  it('the game is over once resolved: no further actions are legal', () => {
    const h = setup({ players: 2, stables: [['basic-unicorn-red'], []], turnPlayer: 0, plays: 1 });
    h.state.deck = [];
    h.state.discard = [];
    h.draw(0);
    expect(() => h.draw(1)).toThrow(/game is over/);
  });

  it('cards drawn before the pile ran dry are kept and their move events fire', () => {
    const h = setup({ players: 2, hands: [['good-deal'], []], turnPlayer: 0, plays: 1 });
    // leave exactly 2 cards in the deck, none in discard; Good Deal tries to draw 3.
    h.state.deck = h.state.deck.slice(0, 2);
    const left = h.state.deck.length;
    h.state.discard = [];
    const drawsBefore = h.state.events.filter((e) => e.kind === 'move' && e.how === 'draw').length;
    h.play(0, 'good-deal');
    expect(h.state.winner).not.toBeNull();
    expect(h.hand(0).length).toBe(left); // the 2 that were left, not 3 (the effect aborted on exhaustion)
    const drawsAfter = h.state.events.filter((e) => e.kind === 'move' && e.how === 'draw').length;
    expect(drawsAfter - drawsBefore).toBe(left);
  });
});
