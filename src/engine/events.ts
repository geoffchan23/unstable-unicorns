import type { GameEvent, GameEventBody, GameState, InstanceId, LogEntry, MoveHow, PlayerId, Zone } from './types';

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

export function moved(state: GameState, card: InstanceId, from: Zone, to: Zone, how: MoveHow, actor?: PlayerId): void {
  emit(state, { kind: 'move', card, from, to, how, ...(actor !== undefined ? { actor } : {}) });
}

export function sameZone(a: Zone, b: Zone): boolean {
  if (a.zone !== b.zone) return false;
  if (a.zone === 'hand' || a.zone === 'stable') return a.player === (b as { player: PlayerId }).player;
  return true;
}
