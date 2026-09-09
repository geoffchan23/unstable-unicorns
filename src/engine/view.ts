import type { GameState, InstanceId, PlayerId } from './types';
import { stableHas, unicornCount, vetoPlay, typeOf } from './queries';
import { previewState } from './game';

export interface PlayerView extends Omit<GameState, 'deck' | 'players' | 'rng' | 'seed'> {
  me: PlayerId;
  deckCount: number;
  unicornCounts: number[];
  /** for cards in my hand: the rule that stops me playing them right now (missing = playable when it is my turn) */
  playBlocks: Record<InstanceId, string>;
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
    playBlocks: Object.fromEntries(players[me]!.hand.flatMap((c) => {
      if (typeOf(state, c) === 'instant') return [];
      const why = vetoPlay(state, me, c);
      return why ? [[c, why]] : [];
    })),
  };
}
