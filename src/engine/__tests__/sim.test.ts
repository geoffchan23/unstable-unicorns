import { describe, it, expect } from 'vitest';
import '../cards';
import { allCardData, definedIds } from '../registry';
import { simulate } from '../sim';
import { createGame, applyAction } from '../game';
import { playersToAct, randomBotAction } from '../bot';

describe('card registry', () => {
  it('has a definition for every card in the data file and nothing extra', () => {
    const dataIds = allCardData().map((c) => c.id).sort();
    expect(definedIds().sort()).toEqual(dataIds);
  });
});

describe('setup', () => {
  it('deals 5 cards, a baby each, and builds the full deck', () => {
    const s = createGame({ players: ['a', 'b', 'c'], seed: 1 });
    expect(s.unicornsToWin).toBe(7);
    expect(s.players[0]!.hand.length).toBe(6); // 5 dealt + the Draw phase
    expect(s.players[1]!.hand.length).toBe(5);
    expect(s.players[2]!.hand.length).toBe(5);
    for (const p of s.players) expect(p.stable.length).toBe(1);
    expect(s.nursery.length).toBe(13 - 3);
    expect(s.turn.phase).toBe('action');
  });
});

describe('random simulations', () => {
  for (const players of [2, 3, 5, 8]) {
    it(`${players}-player games finish with invariants intact`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const r = simulate(seed * 7919, players, 40000);
        expect(r.winner).not.toBeNull();
      }
    });
  }
  it('is deterministic: same seed and actions give the same log', () => {
    const play = () => {
      let s = createGame({ players: ['a', 'b'], seed: 42 });
      let r = 12345;
      const rand = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x80000000; };
      for (let i = 0; i < 60 && s.winner === null; i++) {
        const who = playersToAct(s)[0]!;
        s = applyAction(s, randomBotAction(s, who, rand)!);
      }
      return s.log.map((l) => l.text).join('\n');
    };
    expect(play()).toBe(play());
  });
});
