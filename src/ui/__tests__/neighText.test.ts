import { Harness } from '../../engine/__tests__/harness';
import { describeNeighWindow } from '../neighText';
import type { GameState, PlayerId } from '../../engine/types';
import { cardData } from '../../engine/registry';

// P1 = Ann (seat 0), P2 = Ben (seat 1), P3 = Cat (seat 2)
const NAMES = ['Ann', 'Ben', 'Cat'];
const names = (s: GameState) => ({
  player: (p: PlayerId) => NAMES[p]!,
  card: (id: number) => cardData.get(s.cards[id]!.def)!.name,
  isMagic: (id: number) => cardData.get(s.cards[id]!.def)!.type === 'magic',
});
const text = (h: Harness, me: PlayerId) => describeNeighWindow(h.state.stack, me, names(h.state));

describe('Neigh window wording, driven by the real engine', () => {
  function played() {
    const h = new Harness({ players: 3, hands: [['classy-narwhal', 'neigh'], ['neigh', 'neigh'], ['neigh', 'super-neigh']], plays: 9 });
    h.play(0, 'classy-narwhal', undefined, { autoPass: false });
    return h;
  }

  it('a played card, nobody has responded yet', () => {
    const h = played();
    expect(h.neighWindow()!.awaiting).toEqual([1, 2]);
    const t = text(h, 1);
    expect(t.title).toBe('Ann plays Classy Narwhal');
    expect(t.standsIfPassed).toBe(true);
    expect(t.sub).toBe("If nobody responds, Ann's Classy Narwhal goes ahead. Neigh it and Classy Narwhal is cancelled instead.");
    expect(t.banner).toBe('waiting for Neighs');
    expect(t.featured).toBe(t.base);
  });

  it('one Neigh: the card is cancelled unless someone Neighs back', () => {
    const h = played().neigh(1);
    // Ben Neigh'd, so Ben is not asked again; Ann (the card's owner) and Cat are
    expect(h.neighWindow()!.awaiting).toEqual([0, 2]);
    const forAnn = text(h, 0);
    expect(forAnn.title).toBe('Ben plays Neigh on your Classy Narwhal');
    expect(forAnn.standsIfPassed).toBe(false);
    expect(forAnn.sub).toBe("If nobody responds, your Classy Narwhal is Neigh'd and goes to the discard pile. Neigh back and Classy Narwhal goes ahead after all.");
    const forCat = text(h, 2);
    expect(forCat.title).toBe('Ben plays Neigh on Classy Narwhal');
    expect(forCat.banner).toBe("1 Neigh on it · it's Neigh'd so far");
    // and the engine agrees: everyone passes -> discarded
    h.passAll();
    expect(h.stable(0)).not.toContain('classy-narwhal');
    expect(h.discard()).toEqual(expect.arrayContaining(['classy-narwhal', 'neigh']));
  });

  it('a Neigh on a Neigh: the card stands again', () => {
    const h = played().neigh(1).neigh(0);
    const forCat = text(h, 2);
    expect(forCat.title).toBe("Ann plays Neigh on Ben's Neigh");
    expect(forCat.standsIfPassed).toBe(true);
    expect(forCat.banner).toBe('2 Neighs on it · it stands so far');
    const forBen = text(h, 1);
    expect(forBen.title).toBe('Ann plays Neigh on your Neigh');
    h.passAll();
    expect(h.stable(0)).toContain('classy-narwhal');
  });

  it('three deep: cancelled again, and the wording follows the chain', () => {
    const h = played().neigh(1).neigh(0).neigh(2);
    const forBen = text(h, 1);
    expect(forBen.title).toBe("Cat plays Neigh on Ann's Neigh");
    expect(forBen.standsIfPassed).toBe(false);
    expect(forBen.neighCount).toBe(3);
    h.passAll();
    expect(h.stable(0)).not.toContain('classy-narwhal');
  });

  it('Super Neigh ends the conversation: no window opens, and the card is cancelled', () => {
    const h = played().neigh(2, 'super-neigh');
    expect(h.neighWindow()).toBeNull();
    expect(h.state.stack).toHaveLength(0);
    expect(h.stable(0)).not.toContain('classy-narwhal');
  });

  it("possessives: names ending in s get a bare apostrophe", () => {
    const h = new Harness({ players: 3, hands: [['classy-narwhal'], ['neigh'], []], plays: 9 });
    h.play(0, 'classy-narwhal', undefined, { autoPass: false });
    const t = describeNeighWindow(h.state.stack, 1, { player: (p) => ['Sprinkles', 'Ben', 'Cat'][p]!, card: (id) => cardData.get(h.state.cards[id]!.def)!.name });
    expect(t.sub).toMatch(/^If nobody responds, Sprinkles' Classy Narwhal goes ahead\./);
  });

  it('without a Neigh in hand: past tense, no "Neigh back" advice, and an OK button', () => {
    const h = played().neigh(1);
    const t = describeNeighWindow(h.state.stack, 2, names(h.state), false);
    expect(t.title).toBe('Ben played Neigh on Classy Narwhal');
    expect(t.sub).toBe("If nobody responds, Ann's Classy Narwhal is Neigh'd and goes to the discard pile.");
    expect(t.ok).toBe('OK');
    expect(text(h, 2).ok).toBe('Let it happen');
  });

  it('Upgrades and Downgrades say whose stable they are aimed at', () => {
    const h = new Harness({ players: 3, hands: [['nanny-cam', 'stable-artillery'], [], []], plays: 9 });
    h.play(0, 'nanny-cam', 1, { autoPass: false });
    expect(text(h, 1).title).toBe('Ann plays Nanny Cam on you');
    expect(text(h, 2).title).toBe('Ann plays Nanny Cam on Ben');
    h.passAll();
    h.play(0, 'stable-artillery', 0, { autoPass: false });
    expect(text(h, 2).title).toBe('Ann plays Stable Artillery on themselves');
  });

  it('a Magic card explains that its target is chosen only when it resolves', () => {
    const h = new Harness({ players: 3, hands: [['re-target'], [], []], stables: [['nanny-cam'], [], []], plays: 9 });
    h.play(0, 're-target', undefined, { autoPass: false });
    const t = text(h, 1);
    expect(t.title).toBe('Ann plays Re-Target');
    expect(t.sub).toMatch(/^Ann will pick who it hits only if it goes ahead: Magic cards choose their targets when they resolve\. If nobody responds/);
  });

  it('never says "Neighs Neigh"', () => {
    const h = played().neigh(1).neigh(0).neigh(2);
    for (const me of [0, 1, 2] as PlayerId[]) {
      const t = text(h, me);
      expect(t.title).not.toMatch(/Neighs Neigh/i);
      expect(t.title).toMatch(/^\w+ plays (Super )?Neigh on /);
    }
  });
});
