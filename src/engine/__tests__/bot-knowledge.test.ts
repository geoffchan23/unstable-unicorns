import { describe, it, expect } from 'vitest';
import '../cards';
import { setup } from './harness';
import { applyAction, createGame, legalActions } from '../game';
import { greedyBotAction, playersToAct, randomBotAction } from '../bot';
import { canSeeHand } from '../view';
import { cloneState } from '../clone';
import type { Action, GameState, PlayerId } from '../types';

// The bot is handed the whole GameState because the engine has nothing else to hand it; what keeps that
// honest is that it plans against a re-deal of everything it may not see. So its choice may depend on
// *which* cards are unseen (any player can work that out by elimination) but never on where they are.

/** the same numbers every time, so two runs of the bot differ only in the state they were given */
const seeded = (x = 123456789) => () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;

/**
 * The same game with the unseen cards somewhere else: the hidden hands and the deck are pooled and
 * dealt back into the same slots in a different order. Nothing `me` is allowed to know has changed.
 */
function reshuffleHidden(state: GameState, me: PlayerId, rand: () => number): GameState {
  const s = cloneState(state);
  const hidden = s.players.filter((p) => !canSeeHand(s, me, p.id));
  const pool = [...s.deck, ...hidden.flatMap((p) => p.hand)];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  let at = 0;
  const deckSize = s.deck.length;
  s.deck = pool.slice(at, (at += deckSize));
  for (const p of hidden) p.hand = pool.slice(at, (at += p.hand.length));
  return s;
}

const same = (a: Action[], b: Action[]) => JSON.stringify(a) === JSON.stringify(b);

describe('the bot plays on what it can see', () => {
  it('makes the same choice however the cards it cannot see are arranged', () => {
    const a = setup({
      players: 3,
      hands: [
        ['rainbow-unicorn', 'unicorn-poison', 'neigh'],
        ['back-kick', 'americorn', 'ginormous-unicorn'],
        ['glitter-tornado', 'neigh', 'shark-with-a-horn'],
      ],
      stables: [['llamacorn'], ['narwhal'], ['basic-unicorn-red']],
      deckTop: ['rainbow-aura', 'unicorn-phoenix', 'black-knight-unicorn'],
      plays: 9,
    }).state;
    const b = reshuffleHidden(a, 0, seeded(42));
    expect(b.players[1]!.hand).not.toEqual(a.players[1]!.hand);
    expect(greedyBotAction(b, 0, seeded())).toEqual(greedyBotAction(a, 0, seeded()));
  });

  it('still plans on its own hand, which it can see', () => {
    const a = setup({
      players: 3,
      hands: [['rainbow-unicorn', 'unicorn-poison'], ['back-kick'], ['glitter-tornado']],
      stables: [['llamacorn'], ['narwhal'], ['basic-unicorn-red']],
      plays: 9,
    }).state;
    const b = cloneState(a);
    // trade the bot's whole hand with the deck; this it is allowed to notice
    for (let i = 0; i < b.players[0]!.hand.length; i++) {
      const mine = b.players[0]!.hand[i]!;
      b.players[0]!.hand[i] = b.deck[i]!;
      b.deck[i] = mine;
    }
    expect(greedyBotAction(b, 0, seeded())).not.toEqual(greedyBotAction(a, 0, seeded()));
  });

  it('reads a hand a Nanny Cam has opened, and no other', () => {
    const s = setup({
      players: 3,
      hands: [['rainbow-unicorn', 'neigh'], ['americorn', 'back-kick'], ['glitter-tornado', 'neigh']],
      stables: [['llamacorn'], ['nanny-cam'], ['basic-unicorn-red']],
      plays: 9,
    }).state;
    expect(canSeeHand(s, 0, 1)).toBe(true);   // the Nanny Cam is in player 1's stable
    expect(canSeeHand(s, 0, 2)).toBe(false);
    // the re-deal leaves the open hand alone, so this is only the still-hidden cards moving
    const moved = reshuffleHidden(s, 0, seeded(9));
    expect(moved.players[1]!.hand).toEqual(s.players[1]!.hand);
    expect(greedyBotAction(moved, 0, seeded())).toEqual(greedyBotAction(s, 0, seeded()));
  });

  // The one above is a single position. This plays real games and checks the same property at every
  // decision in them: whenever moving the unseen cards leaves the bot with the same options, it must
  // make the same choice. Anything the bot learns from hidden cards shows up here.
  it('holds at every decision of a real game', () => {
    let checked = 0;
    for (let game = 0; game < 4; game++) {
      const rand = seeded(1000 + game * 7919);
      let s: GameState = createGame({ players: ['A', 'B', 'C', 'D'], seed: 500 + game, twoPlayerVariant: false });
      for (let step = 0; step < 220 && s.winner === null; step++) {
        const who = playersToAct(s)[0];
        if (who === undefined) break;
        const opts = legalActions(s, who);
        if (opts.length === 0) break;
        if (opts.length > 1) {
          const variant = reshuffleHidden(s, who, rand);
          // skip the decisions whose options name hidden cards: those genuinely differ between
          // arrangements, and the bot picking a different one of them is the point, not a leak
          if (same(opts, legalActions(variant, who))) {
            expect(greedyBotAction(variant, who, seeded()), `game ${game} step ${step}`)
              .toEqual(greedyBotAction(s, who, seeded()));
            checked++;
          }
        }
        s = applyAction(s, randomBotAction(s, who, rand)!);
      }
    }
    expect(checked, 'the fuzz should reach plenty of real decisions').toBeGreaterThan(100);
  });
});
