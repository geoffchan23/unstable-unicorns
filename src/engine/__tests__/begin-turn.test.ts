import { setup } from './harness';

/** P2 is about to start their turn: P1 draws as their action. */
const p2 = (o: Parameters<typeof setup>[0] = {}) => { const h = setup({ ...o, plays: 1 }); h.draw(0); return h; };

describe('beginning of turn window', () => {
  it('lists every usable beginning-of-turn card and lets the player pick the order', () => {
    const h = p2({ stables: [[], ['claw-machine', 'caffeine-overload', 'basic-unicorn-red']], hands: [[], ['neigh']], deckTop: ['yay', 'a1', 'a2', 'a3'].map((x) => (x === 'yay' ? 'yay' : 'neigh')) });
    const w = h.beginWindow()!;
    expect(h.defs(w.options)).toEqual(['claw-machine', 'caffeine-overload']);
    expect(w.mandatory).toEqual([]);
    expect(h.legal(1).map((a) => a.type)).toEqual(['beginTurn', 'beginTurn', 'beginTurn']);
    expect(h.legal(0)).toEqual([]);
    // caffeine first (sacrifice the unicorn, draw 2), then claw machine (discard one, draw one)
    h.useBegin('caffeine-overload').answerCard('basic-unicorn-red');
    expect(h.defs(h.beginWindow()!.options)).toEqual(['claw-machine']);
    h.useBegin('claw-machine');
    expect(h.prompt()?.message).toMatch(/Choose a card to DISCARD/);   // no "are you sure?" first
    h.autoAnswer();
    expect(h.state.turn.phase).toBe('action');
    expect(h.state.log.some((l) => l.text === 'P2 uses Caffeine Overload.')).toBe(true);
  });

  it('draw straight away skips the optional cards but resolves the mandatory ones', () => {
    const h = p2({ stables: [[], ['rhinocorn', 'sadistic-ritual', 'basic-unicorn-red']] });
    const w = h.beginWindow()!;
    expect(h.defs(w.options)).toEqual(['rhinocorn', 'sadistic-ritual']);
    expect(h.defs(w.mandatory)).toEqual(['sadistic-ritual']);
    h.skipBegin();
    expect(h.prompt()?.message).toMatch(/Sadistic Ritual/);
    h.answerCard('basic-unicorn-red');
    expect(h.beginWindow()).toBeNull();
    expect(h.state.turn.phase).toBe('action');
    expect(h.stable(1)).toContain('rhinocorn');   // never asked, never used
  });

  it('cards that run on their own (Double Dutch) do not open a window', () => {
    const h = p2({ stables: [[], ['double-dutch']] });
    expect(h.beginWindow()).toBeNull();
    expect(h.state.turn.phase).toBe('action');
    expect(h.state.turn.playsRemaining).toBe(2);
  });

  it('a card that leaves the stable mid-phase is no longer offered', () => {
    const h = p2({ stables: [[], ['glitter-bomb', 'rhinocorn']], hands: [[], []] });
    h.useBegin('glitter-bomb').answerCard('rhinocorn');   // sacrifice Rhinocorn to destroy...
    h.autoAnswer();
    expect(h.beginWindow()).toBeNull();                    // nothing left to offer
    expect(h.state.turn.phase).toBe('action');
  });

  it('rejects using a card that is not offered, and anyone but the turn player', () => {
    const h = p2({ stables: [[], ['claw-machine']], hands: [[], ['neigh']] });
    const w = h.beginWindow()!;
    expect(() => h.apply({ type: 'beginTurn', player: 0, card: null })).toThrow(/not your turn/);
    expect(() => h.apply({ type: 'beginTurn', player: 1, card: 9999 })).toThrow(/no beginning-of-turn effect/);
    expect(w.options).toHaveLength(1);
  });
});
