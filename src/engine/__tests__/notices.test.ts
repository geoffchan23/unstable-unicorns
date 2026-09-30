import { Harness } from './harness';

const setup = (discard: string[]) =>
  new Harness({ players: 2, hands: [['magical-flying-unicorn', 'swift-flying-unicorn'], []], discard, plays: 9, twoPlayerVariant: false });
const notices = (h: Harness) => h.state.log.filter((l) => l.notice).map((l) => l.text);

describe('"you may take a card from the discard pile" with nothing to take', () => {
  it('Magical Flying Unicorn: no Magic cards -> no prompt, but a notice says so', () => {
    const h = setup(['neigh', 'nanny-cam']);
    h.play(0, 'magical-flying-unicorn');
    expect(h.prompt()).toBeNull();
    expect(h.stable(0)).toContain('magical-flying-unicorn');
    expect(h.hand(0)).toEqual(['swift-flying-unicorn']);
    expect(notices(h)).toEqual(["P1's Magical Flying Unicorn: no Magic cards in the discard pile."]);
  });
  it('Magical Flying Unicorn: one Magic card -> still asked (optional), and taking it works', () => {
    const h = setup(['unicorn-poison']);
    h.play(0, 'magical-flying-unicorn');
    const p = h.prompt();
    expect(p?.kind).toBe('chooseCard');
    expect(p?.optional).toBe(true);
    expect(p?.options).toHaveLength(1);
    h.answerCard('unicorn-poison');
    expect(h.hand(0)).toContain('unicorn-poison');
    expect(notices(h)).toEqual([]);
  });
  it('Magical Flying Unicorn: declining the offer leaves the pile alone', () => {
    const h = setup(['unicorn-poison', 'good-deal']);
    h.play(0, 'magical-flying-unicorn');
    expect(h.prompt()?.options).toHaveLength(2);
    h.answer(null);
    expect(h.hand(0)).toEqual(['swift-flying-unicorn']);
    expect(h.discard()).toEqual(expect.arrayContaining(['unicorn-poison', 'good-deal']));
  });
  it('Swift Flying Unicorn: no Neighs in the pile -> notice', () => {
    const h = setup(['unicorn-poison']);
    h.play(0, 'swift-flying-unicorn');
    expect(h.prompt()).toBeNull();
    expect(notices(h)).toEqual(["P1's Swift Flying Unicorn: no Neigh cards in the discard pile."]);
  });
});

describe('an effect that finds nothing, or is switched off, says so', () => {
  it('The Great Narwhal: no Narwhal cards left in the deck -> no prompt, a notice names what was missing', () => {
    const h = new Harness({ players: 2, hands: [['the-great-narwhal'], []], plays: 9, twoPlayerVariant: false });
    h.state.deck = h.state.deck.filter((c) => !/narwhal/.test(h.state.cards[c]!.def));
    h.play(0, 'the-great-narwhal');
    expect(h.prompt()).toBeNull();
    expect(notices(h)).toEqual(["P1's The Great Narwhal: no Narwhal cards left in the deck."]);
  });
  it('Blinding Light: an arriving unicorn whose effect is ignored gets a notice', () => {
    const h = new Harness({ players: 2, stables: [['blinding-light'], []], hands: [['the-great-narwhal'], []], plays: 9, twoPlayerVariant: false });
    h.play(0, 'the-great-narwhal');
    expect(h.prompt()).toBeNull();
    expect(h.hand(0)).toEqual([]);
    expect(notices(h)).toEqual(["Blinding Light: The Great Narwhal's effect is ignored."]);
  });
});
