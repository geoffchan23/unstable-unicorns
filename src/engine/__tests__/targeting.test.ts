import { Harness } from './harness';
import { greedyBotAction } from '../bot';

describe('Upgrades and Downgrades played into another stable', () => {
  it('the log names who played it and whose stable it went into, tagged for the receiver', () => {
    const h = new Harness({ players: 2, hands: [['stable-artillery'], []], babies: false, plays: 9, twoPlayerVariant: false });
    h.play(0, 'stable-artillery', 1);
    expect(h.stable(1)).toContain('stable-artillery');
    const line = h.state.log[h.state.log.length - 1]!;
    expect(line.text).toBe("P1 plays Stable Artillery into P2's stable.");
    expect(line.affects).toEqual([1]);
    // into your own stable stays the plain wording
    const h2 = new Harness({ players: 2, hands: [['stable-artillery'], []], babies: false, plays: 9, twoPlayerVariant: false });
    h2.play(0, 'stable-artillery', 0);
    expect(h2.state.log[h2.state.log.length - 1]!.text).toBe('P1 plays Stable Artillery into their stable.');
  });

  it('the bot keeps Upgrades for itself and gives Downgrades away', () => {
    const rand = () => 0.42;
    const up = new Harness({ players: 3, hands: [['stable-artillery'], [], []], plays: 9 });
    for (let i = 0; i < 20; i++) {
      const a = greedyBotAction(up.state, 0, rand)!;
      if (a.type === 'play') expect(a.targetPlayer).toBe(0);
    }
    const down = new Harness({ players: 3, hands: [['slowdown'], [], []], plays: 9 });
    for (let i = 0; i < 20; i++) {
      const a = greedyBotAction(down.state, 0, rand)!;
      if (a.type === 'play') expect(a.targetPlayer).not.toBe(0);
    }
  });
});
