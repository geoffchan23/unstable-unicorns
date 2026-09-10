import { describe, it, expect } from 'vitest';
import '../../engine/cards';
import { createGame, applyAction } from '../../engine/game';
import { viewFor, type PlayerView } from '../../engine/view';
import { playersToAct, randomBotAction } from '../../engine/bot';
import { applyEvent, freshEvents, rewind } from '../stage/playback';

const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
const zones = (v: PlayerView) => ({
  deck: v.deckCount, discard: sorted(v.discard), nursery: sorted(v.nursery), limbo: sorted(v.limbo),
  players: v.players.map((p) => ({ stable: sorted(p.stable), handCount: p.handCount, hand: p.hand ? sorted(p.hand) : null })),
});

describe('playback', () => {
  it('rewinds the new view to the old one and replays back, for every player in random games', () => {
    for (const seed of [5, 6, 7]) {
      let s = createGame({ players: ['a', 'b', 'c'], seed });
      let r = seed;
      const rand = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x80000000; };
      for (let i = 0; i < 300 && s.winner === null; i++) {
        const who = playersToAct(s)[0]!;
        const next = applyAction(s, randomBotAction(s, who, rand)!);
        for (const me of [0, 1, 2]) {
          const before = viewFor(s, me);
          const after = viewFor(next, me);
          const lastSeq = before.events.length ? before.events[before.events.length - 1]!.seq : -1;
          const fresh = freshEvents(after, lastSeq);
          // preview events (a partially run effect) are in `before` too; they never disagree with `after`
          // (except that a Nanny Cam arriving later can un-hide a card id)
          for (const e of before.events) {
            const a = after.events[e.seq]!;
            if (e.kind === 'move' && a.kind === 'move' && (e.card === null || a.card === null)) expect({ ...a, card: 0 }).toEqual({ ...e, card: 0 });
            else expect(a).toEqual(e);
          }
          const rewound = rewind(after, fresh);
          // a Nanny Cam arriving in this step reveals a hand the old view could not list: compare counts then
          const z = zones(rewound); const zb = zones(before);
          z.players.forEach((p, k) => { if (zb.players[k]!.hand === null) p.hand = null; });
          // a reshuffle empties the discard pile; the view cannot know what was in it
          if (fresh.some((e) => e.kind === 'shuffle')) z.discard = zb.discard;
          expect(z, `seed ${seed} step ${i} viewer ${me}: rewind`).toEqual(zb);
          let v = rewound;
          for (const e of fresh) v = applyEvent(v, e);
          expect(zones(v), `seed ${seed} step ${i} viewer ${me}: replay`).toEqual(zones(after));
        }
        s = next;
      }
    }
  });
});
