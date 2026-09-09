import { Harness } from '../../engine/__tests__/harness';
import { describePrompt } from '../promptText';
import { cardData } from '../../engine/registry';
import type { GameState, Prompt } from '../../engine/types';

const NAMES = ['Ann', 'Ben', 'Cat'];
const names = (s: GameState) => ({
  player: (p: number) => NAMES[p]!,
  card: (id: number) => cardData.get(s.cards[id]!.def)!.name,
  cardText: (id: number) => cardData.get(s.cards[id]!.def)!.text,
});

describe('prompt wording, driven by the real engine', () => {
  it('a Magic card played on you: who, what, why, and what to do', () => {
    const h = new Harness({ players: 3, hands: [['back-kick'], ['neigh', 'neigh'], []], stables: [[], ['basic-unicorn-red'], []], babies: false, plays: 9 });
    h.play(0, 'back-kick');
    h.answerCard('basic-unicorn-red');   // Ann picks which card in Ben's stable
    const p = h.prompt()!;
    expect(p.player).toBe(1);
    expect(p.actor).toBe(0);
    expect(p.cause).toBe('play');
    const t = describePrompt(p, names(h.state));
    expect(t.title).toBe('Ann played Back Kick on you');
    expect(t.sub).toMatch(/^Return a card in another player's Stable/);
    expect(t.instruction).toBe('DISCARD a card');
    expect(t.hitBy).toEqual({ player: 'Ann', card: 'Back Kick' });
    // and once Ben answers, the committed log tells him what happened to his stable, tagged for him
    h.answerCard('neigh');
    const hit = h.state.log.filter((l) => l.affects?.includes(1)).map((l) => l.text);
    expect(hit).toEqual(["P1's Back Kick returns P2's Basic Unicorn (Red) to their hand."]);
  });

  it("someone's card is about to destroy yours: the replacement question names the culprit", () => {
    const h = new Harness({ players: 2, hands: [['shark-with-a-horn'], []], stables: [[], ['basic-unicorn-red', 'black-knight-unicorn']], babies: false, plays: 9, twoPlayerVariant: false });
    h.play(0, 'shark-with-a-horn');
    h.answer(true);                       // sacrifice the shark to destroy a unicorn
    h.answerCard('basic-unicorn-red');    // Ann picks Ben's unicorn
    const p = h.prompt()!;
    expect(p.player).toBe(1);
    const t = describePrompt(p, names(h.state));
    expect(t.title).toBe("Ann's Shark With a Horn hits you");
    expect(t.instruction).toBe('Basic Unicorn (Red) would be destroyed. SACRIFICE Black Knight Unicorn instead?');
    expect(p.cause).toBe('effect');
  });

  it('your own card asks you something: plain question, card text underneath', () => {
    const h = new Harness({ players: 2, hands: [['magical-flying-unicorn'], []], discard: ['unicorn-poison', 'good-deal'], plays: 9, twoPlayerVariant: false });
    h.play(0, 'magical-flying-unicorn');
    const t = describePrompt(h.prompt()!, names(h.state));
    expect(t.title).toBe('Take a Magic card from the discard pile?');
    expect(t.sub).toMatch(/^Magical Flying Unicorn: When this card enters your Stable/);
    expect(t.instruction).toBeNull();
  });

  it('a destroyed card is logged with the culprit and tagged for the victim', () => {
    const h = new Harness({ players: 2, hands: [['unicorn-poison'], []], stables: [[], ['basic-unicorn-red']], babies: false, plays: 9, twoPlayerVariant: false });
    h.play(0, 'unicorn-poison');
    h.answerCard('basic-unicorn-red');
    const last = h.state.log[h.state.log.length - 1]!;
    expect(last.text).toBe("P1's Unicorn Poison destroys P2's Basic Unicorn (Red).");
    expect(last.affects).toEqual([1]);
  });

  it('the hand-limit prompt explains itself', () => {
    const p: Prompt = { id: 1, player: 0, kind: 'chooseCard', message: 'Discard down to 7 cards', options: [1, 2], optional: false };
    const t = describePrompt(p, { player: () => 'x', card: () => 'y', cardText: () => 'z' });
    expect(t.title).toBe('Discard down to 7 cards');
    expect(t.sub).toMatch(/Hand limit/);
  });
});
