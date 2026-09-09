// Group the flat game log into turns, so the history sheet can page through them.
import type { LogEntry } from '../engine/types';

export interface TurnSegment {
  /** position in the list (0 = setup, before anyone's first turn) */
  index: number;
  /** the engine's turn counter for these lines */
  turn: number;
  /** whose turn it was; null for the setup lines */
  player: string | null;
  lines: LogEntry[];
}

const MARK = /^--- (.+)'s turn ---$/;

export function groupTurns(log: LogEntry[]): TurnSegment[] {
  const out: TurnSegment[] = [];
  let cur: TurnSegment | null = null;
  for (const l of log) {
    const m = MARK.exec(l.text);
    if (m) {
      cur = { index: out.length, turn: l.turn, player: m[1]!, lines: [] };
      out.push(cur);
      continue;
    }
    if (!cur) { cur = { index: 0, turn: l.turn, player: null, lines: [] }; out.push(cur); }
    cur.lines.push(l);
  }
  return out;
}

/** Split a log line into text and card-name tokens, longest names first so "Baby Unicorn" beats "Unicorn". */
export function tokenizeLine(text: string, names: string[]): { text: string; card?: string }[] {
  if (names.length === 0) return [{ text }];
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const re = new RegExp(sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  const parts: { text: string; card?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: m[0], card: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
