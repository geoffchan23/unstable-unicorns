import type { GameState } from './types';

/** Deep-copy the game state, but only shallow-copy the append-only log and event stream (they can get long). */
export function cloneState(state: GameState): GameState {
  const { log, events, ...rest } = state;
  const copy = structuredClone(rest) as GameState;
  copy.log = log.slice();
  copy.events = events.slice();
  return copy;
}
