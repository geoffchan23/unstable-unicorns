import '../src/engine/cards';
import { createGame, applyAction } from '../src/engine/game';
import { randomBotAction, playersToAct } from '../src/engine/bot';
import { cardData } from '../src/engine/registry';
const seen = new Map<string, { source: string; handler: string; message: string; kind: string; othersTarget: boolean; n: number }>();
let rng = 12345; const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
for (let g = 0; g < 300; g++) {
  let s = createGame({ players: ['A', 'B', 'C', 'D'], seed: 1000 + g });
  for (let i = 0; i < 4000 && s.winner === null; i++) {
    const p = s.pending;
    if (p && p.kind === 'prompt') {
      const head = s.effectQueue[0];
      const src = p.prompt.source !== undefined ? cardData.get(s.cards[p.prompt.source]!.def)!.name : (head?.kind === 'builtin' ? head.name : '?');
      const handler = head?.kind === 'card' ? head.handler : head?.kind === 'builtin' ? head.name : '?';
      const controller = head?.kind === 'card' ? head.controller : head?.kind === 'builtin' ? head.player : -1;
      const key = `${src}|${p.prompt.message}|${p.prompt.player !== controller}`;
      const e = seen.get(key) ?? { source: src, handler, message: p.prompt.message, kind: p.prompt.kind, othersTarget: p.prompt.player !== controller, n: 0 };
      e.n++; seen.set(key, e);
    }
    const actors = playersToAct(s); if (!actors.length) break;
    const a = randomBotAction(s, actors[0]!, rand); if (!a) break;
    s = applyAction(s, a);
  }
}
const rows = [...seen.values()].sort((a, b) => Number(b.othersTarget) - Number(a.othersTarget) || a.source.localeCompare(b.source));
for (const r of rows) console.log(`${r.othersTarget ? 'OTHER' : 'self '} | ${r.source} | ${r.handler} | ${r.kind} | ${r.message}`);
console.log('distinct prompts:', rows.length);
