import type { GameState, InstanceId, PlayerId } from './types';
import { stableHas, unicornCount } from './queries';
import { previewState } from './game';

export interface PlayerView extends Omit<GameState, 'deck' | 'players' | 'rng' | 'seed'> {
  me: PlayerId;
  deckCount: number;
  unicornCounts: number[];
  players: { id: PlayerId; name: string; stable: InstanceId[]; handCount: number; hand: InstanceId[] | null }[];
}

/** Project the state for one player: other hands hidden (unless Nanny Cam), deck order hidden. */
export function viewFor(input: GameState, me: PlayerId): PlayerView {
  const state = previewState(input);
  const { deck, players, rng, seed, ...rest } = state;
  void rng; void seed;
  return {
    ...structuredClone(rest),
    me,
    deckCount: deck.length,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      stable: [...p.stable],
      handCount: p.hand.length,
      hand: p.id === me || stableHas(state, p.id, 'nanny-cam') ? [...p.hand] : null,
    })),
    unicornCounts: players.map((p) => unicornCount(state, p.id)),
  };
}
