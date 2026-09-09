// Replay a game report copied from the app ("seed 123" link in the top bar) and print what happened.
// Usage: npx tsx scripts/replay.ts report.json [--verbose]
import { readFileSync } from 'node:fs';
import '../src/engine/cards';
import { createGame, applyAction, legalActions } from '../src/engine/game';
import { cardData } from '../src/engine/registry';
import type { Action, GameState } from '../src/engine/types';

const file = process.argv[2];
if (!file) { console.error('usage: npx tsx scripts/replay.ts report.json [--verbose]'); process.exit(2); }
const verbose = process.argv.includes('--verbose');
const rep = JSON.parse(readFileSync(file, 'utf8')) as { seed: number; seats: { name: string; kind: string }[]; actions: Action[] };
let s: GameState = createGame({ players: rep.seats.map((x) => x.name), seed: rep.seed });
const name = (st: GameState, id: number) => cardData.get(st.cards[id]!.def)!.name;
const fmt = (st: GameState, a: Action) => {
  const who = st.players[a.player]!.name;
  switch (a.type) {
    case 'play': return `${who} plays ${name(st, a.card)}${a.targetPlayer !== undefined ? ` -> ${st.players[a.targetPlayer]!.name}` : ''}`;
    case 'neigh': return `${who} neighs with ${name(st, a.card)}`;
    case 'respond': return `${who} answers ${JSON.stringify(a.answer)}`;
    case 'beginTurn': return `${who} ${a.card === null ? 'draws (skips begin-turn cards)' : `uses ${name(st, a.card)}`}`;
    default: return `${who} ${a.type}`;
  }
};
let logMark = s.log.length;
rep.actions.forEach((a, i) => {
  const pend = s.pending;
  const pendDesc = pend ? (pend.kind === 'prompt' ? `prompt for ${s.players[pend.prompt.player]!.name}: "${pend.prompt.message}"` : pend.kind) : `turn ${s.turn.number} ${s.turn.phase}`;
  try {
    const next = applyAction(s, a);
    if (verbose) { console.log(`#${i} [${pendDesc}] ${fmt(s, a)}`); for (const l of next.log.slice(logMark)) console.log('     ' + l.text); }
    s = next; logMark = s.log.length;
  } catch (e) {
    console.log(`#${i} [${pendDesc}] ${fmt(s, a)}  <-- ILLEGAL: ${(e as Error).message}`);
    console.log('legal here:', legalActions(s, a.player).map((x) => fmt(s, x)).join(' | '));
    process.exit(1);
  }
});
console.log(`replayed ${rep.actions.length} actions; turn ${s.turn.number}, phase ${s.turn.phase}, winner ${s.winner === null ? 'none' : s.players[s.winner]!.name}`);
console.log('last log lines:'); for (const l of s.log.slice(-8)) console.log('  ' + l.text);
