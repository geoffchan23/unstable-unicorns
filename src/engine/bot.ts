import type { Action, GameState, PlayerId } from './types';
import { legalActions } from './game';

/** Which players can act right now? */
export function playersToAct(state: GameState): PlayerId[] {
  if (state.winner !== null) return [];
  const p = state.pending;
  if (p) return p.kind === 'prompt' ? [p.prompt.player] : [...p.awaiting];
  return state.turn.phase === 'action' ? [state.turn.player] : [];
}

/** A uniformly random legal action for the given player, using an external RNG. */
export function randomBotAction(state: GameState, player: PlayerId, rand: () => number): Action | null {
  const acts = legalActions(state, player);
  if (acts.length === 0) return null;
  return acts[Math.floor(rand() * acts.length)]!;
}
