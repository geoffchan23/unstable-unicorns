import type { GameEvent, GameEventBody, GameState, InstanceId, LogEntry, MoveHow, PlayerId, Zone } from './types';
import { stableHas } from './queries';

/** Append an event; `seq` is its index. */
export function emit(state: GameState, ev: GameEventBody): void {
  state.events.push({ seq: state.events.length, ...ev } as GameEvent);
}

/** A log line, mirrored as a `say` event so the UI can show it in order with the moves around it. */
export function say(state: GameState, entry: Omit<LogEntry, 'turn'>): void {
  const line: LogEntry = { turn: state.turn.number, text: entry.text };
  if (entry.notice) line.notice = true;
  if (entry.affects && entry.affects.length) line.affects = entry.affects;
  if (entry.actor !== undefined) line.actor = entry.actor;
  state.log.push(line);
  const { turn, ...rest } = line;
  void turn;
  emit(state, { kind: 'say', ...rest });
}

/**
 * Who may know which card this was. A public zone (a stable, the discard pile, the nursery, a card
 * resolving) shows the card to the table, and returns undefined: everyone. The deck shows it to nobody;
 * a hand shows it to its owner, or to everyone while a Nanny Cam sits in that owner's stable.
 */
function seenBy(state: GameState, from: Zone, to: Zone): PlayerId[] | undefined {
  const seers = new Set<PlayerId>();
  for (const z of [from, to]) {
    if (z.zone === 'deck') continue;
    if (z.zone !== 'hand') return undefined;                    // a public zone: everyone sees it
    if (stableHas(state, z.player, 'nanny-cam')) return undefined;
    seers.add(z.player);
  }
  return [...seers];
}

export function moved(state: GameState, card: InstanceId, from: Zone, to: Zone, how: MoveHow, actor?: PlayerId): void {
  const seers = seenBy(state, from, to);
  emit(state, { kind: 'move', card, from, to, how, ...(actor !== undefined ? { actor } : {}), ...(seers ? { seenBy: seers } : {}) });
}

export function sameZone(a: Zone, b: Zone): boolean {
  if (a.zone !== b.zone) return false;
  if (a.zone === 'hand' || a.zone === 'stable') return a.player === (b as { player: PlayerId }).player;
  return true;
}
