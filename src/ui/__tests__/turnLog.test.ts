import { groupTurns, tokenizeLine } from '../turnLog';

describe('groupTurns', () => {
  it('splits the log at turn markers and keeps setup lines first', () => {
    const log = [
      { turn: 1, text: 'Game start. 3 players, first to 7 Unicorns.' },
      { turn: 1, text: "--- Ann's turn ---" },
      { turn: 1, text: 'Ann draws 1 card.' },
      { turn: 1, text: 'Ann plays Classy Narwhal.' },
      { turn: 2, text: "--- Ben's turn ---" },
      { turn: 2, text: 'Ben draws 1 card.' },
    ];
    const t = groupTurns(log);
    expect(t.map((s) => [s.index, s.turn, s.player, s.lines.length])).toEqual([[0, 1, null, 1], [1, 1, 'Ann', 2], [2, 2, 'Ben', 1]]);
    expect(t[1]!.lines.map((l) => l.text)).toEqual(['Ann draws 1 card.', 'Ann plays Classy Narwhal.']);
  });
  it('handles an empty log and a log with no markers', () => {
    expect(groupTurns([])).toEqual([]);
    expect(groupTurns([{ turn: 1, text: 'x' }])).toEqual([{ index: 0, turn: 1, player: null, lines: [{ turn: 1, text: 'x' }] }]);
  });
});

describe('tokenizeLine', () => {
  it('marks card names, preferring the longest match', () => {
    const parts = tokenizeLine('Ann plays Baby Unicorn (Rainbow) and Unicorn Poison.', ['Unicorn Poison', 'Baby Unicorn (Rainbow)', 'Unicorn']);
    expect(parts).toEqual([
      { text: 'Ann plays ' }, { text: 'Baby Unicorn (Rainbow)', card: 'Baby Unicorn (Rainbow)' }, { text: ' and ' },
      { text: 'Unicorn Poison', card: 'Unicorn Poison' }, { text: '.' },
    ]);
  });
  it('leaves plain text alone', () => {
    expect(tokenizeLine('Ann draws 1 card.', ['Neigh'])).toEqual([{ text: 'Ann draws 1 card.' }]);
  });
});
