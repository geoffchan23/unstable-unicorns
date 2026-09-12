import type { GameEvent, GameState, InstanceId, PlayerId } from './types';
import { stableHas, unicornCount, vetoPlay, typeOf } from './queries';
import { previewState } from './game';

export interface PlayerView extends Omit<GameState, 'deck' | 'players' | 'rng' | 'seed'> {
  me: PlayerId;
  deckCount: number;
  unicornCounts: number[];
  /** for cards in my hand: the rule that stops me playing them right now (missing = playable when it is my turn) */
  playBlocks: Record<InstanceId, string>;
  players: {
    id: PlayerId; name: string; stable: InstanceId[]; handCount: number;
    /** the cards, when this viewer may see them; null when the hand is hidden from them */
    hand: InstanceId[] | null;
    /** this player's hand is face up to the whole table (a Nanny Cam in their stable) */
    handOpen: boolean;
  }[];
}

/**
 * Whose hand a player is allowed to read: their own, plus anyone a Nanny Cam has opened to the table.
 * The one rule — `viewFor` redacts by it and `bot.ts` decides what the bot may not know by it, so the
 * two can never drift apart.
 */
export function canSeeHand(state: GameState, viewer: PlayerId, owner: PlayerId): boolean {
  return viewer === owner || stableHas(state, owner, 'nanny-cam');
}

/** Project the state for one player: other hands hidden (unless Nanny Cam), deck order hidden. */
export function viewFor(input: GameState, me: PlayerId): PlayerView {
  const state = previewState(input);
  const { deck, players, rng, seed, events, ...rest } = state;
  void rng; void seed;
  return {
    ...structuredClone(rest),
    // a card that moved where I could not see it (a draw into someone else's hand) stays anonymous.
    // `seenBy` was decided when the move happened, so a Nanny Cam played later never reveals the past.
    events: events.map((e): GameEvent => (e.kind === 'move' && e.card !== null && e.seenBy && !e.seenBy.includes(me) ? { ...e, card: null } : e)),
    me,
    deckCount: deck.length,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      stable: [...p.stable],
      handCount: p.hand.length,
      hand: canSeeHand(state, me, p.id) ? [...p.hand] : null,
      handOpen: stableHas(state, p.id, 'nanny-cam'),
    })),
    unicornCounts: players.map((p) => unicornCount(state, p.id)),
    playBlocks: Object.fromEntries(players[me]!.hand.flatMap((c) => {
      if (typeOf(state, c) === 'instant') return [];
      const why = vetoPlay(state, me, c);
      return why ? [[c, why]] : [];
    })),
  };
}
