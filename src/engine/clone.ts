import type { GameState } from './types';

/** Deep-copy the game state, but only shallow-copy the append-only log (it can get long). */
export function cloneState(state: GameState): GameState {
  const { log, ...rest } = state;
  const copy = structuredClone(rest) as GameState;
  copy.log = log.slice();
  return copy;
}
