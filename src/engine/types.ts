// Core engine types. Everything here is plain JSON-serialisable data.

export type PlayerId = number;          // seat index, also turn order
export type CardId = string;            // definition id from data/base-set-2e.json
export type InstanceId = number;        // unique per physical card in a game

export type CardType =
  | 'baby_unicorn' | 'basic_unicorn' | 'magical_unicorn'
  | 'magic' | 'instant' | 'upgrade' | 'downgrade';

export interface CardData {
  id: CardId;
  name: string;
  type: CardType;
  isUnicorn: boolean;
  count: number;
  text: string;
  cardNumber: string | null;
  triggers: string[];
  removedInTwoPlayer: boolean;
  notes?: string;
}

export interface CardInstance {
  id: InstanceId;
  def: CardId;
}

export type Phase = 'begin' | 'draw' | 'action' | 'end';

export interface Turn {
  player: PlayerId;
  phase: Phase;
  /** cards that were in the stable when the Beginning of Turn phase started */
  beginTurnQueued: boolean;
  playsRemaining: number;
  extraTurns: number;
  endDiscardQueued: boolean;
  number: number;
  /** beginning-of-turn cards already used (or skipped) this turn */
  beginDone: InstanceId[];
}

export interface Player {
  id: PlayerId;
  name: string;
  hand: InstanceId[];
  stable: InstanceId[];
}

/** A card that has been played and is waiting for Neigh responses / resolution. */
export interface StackItem {
  card: InstanceId;
  player: PlayerId;
  /** stable the card is aimed at (Upgrade/Downgrade). */
  targetPlayer?: PlayerId;
  /** stack index of the item this Neigh is answering (Neighs only). */
  answering?: number;
}

export type PromptKind = 'chooseCard' | 'choosePlayer' | 'confirm' | 'chooseOption' | 'orderCards';

export interface Prompt {
  id: number;
  player: PlayerId;
  kind: PromptKind;
  message: string;
  /** instance ids / player ids / option keys, depending on kind. */
  options: (number | string)[];
  optional: boolean;
  /** for chooseCard: how many to pick (default 1). */
  count?: number;
  source?: InstanceId;
  /** the player whose effect raised this prompt (may differ from `player` when a card hits someone else). */
  actor?: PlayerId;
  /** how the effect came about: a Magic card being played, or a card's triggered effect. */
  cause?: 'play' | 'effect';
}

export interface NeighWindow {
  kind: 'neighWindow';
  stackIndex: number;
  awaiting: PlayerId[];
}

/** The beginning of a turn: the player picks which of their beginning-of-turn cards to use, in any order. */
export interface BeginTurnWindow {
  kind: 'beginTurn';
  player: PlayerId;
  /** stable cards whose beginning-of-turn effect has not been used yet this turn */
  options: InstanceId[];
  /** the subset that must resolve before the draw (they run in stable order if skipped) */
  mandatory: InstanceId[];
}

export type Pending = { kind: 'prompt'; prompt: Prompt } | NeighWindow | BeginTurnWindow;

export type Answer = number | string | boolean | number[] | null;

export type EffectHandlerName =
  | 'onEnter' | 'onBeginTurn' | 'onLeave' | 'onPlayMagic'
  | 'onUnicornEntered' | 'onUnicornLeft' | 'onStableChanged';

export type PendingEffect =
  | {
      kind: 'card';
      card: InstanceId;
      handler: EffectHandlerName;
      controller: PlayerId;
      answers: Answer[];
      /** extra data for the handler, e.g. the unicorn that entered. */
      payload?: Record<string, unknown>;
    }
  | {
      kind: 'builtin';
      name: 'endTurnDiscard' | 'discardLimbo' | 'system';
      player: PlayerId;
      answers: Answer[];
      card?: InstanceId;
    };

export interface LogEntry {
  turn: number;
  text: string;
  /** something the players should be told about that did not raise a prompt (e.g. "nothing to choose from") */
  notice?: boolean;
  /** players on the receiving end of this line (their card was destroyed, their hand taken...) */
  affects?: PlayerId[];
  /** the player who did this, when there is one (the UI puts the line in their speech bubble) */
  actor?: PlayerId;
}

/** Where a card is. */
export type Zone =
  | { zone: 'hand'; player: PlayerId }
  | { zone: 'stable'; player: PlayerId }
  | { zone: 'deck' } | { zone: 'discard' } | { zone: 'nursery' } | { zone: 'limbo' };

/** Why a card moved; the UI picks an animation by it. */
export type MoveHow =
  | 'draw' | 'play' | 'neigh' | 'resolve' | 'countered' | 'discard' | 'destroy' | 'sacrifice'
  | 'return' | 'steal' | 'move' | 'bring' | 'search' | 'deckTop';

/**
 * What happened, in order, for a UI to stage. Every log line is mirrored as a `say`; every zone change
 * (after the deal) is a `move`. `seq` is the index in `state.events`; effects replay deterministically, so a
 * preview run and the committed run number the same events identically.
 */
export type GameEventBody =
  | { kind: 'move'; card: InstanceId | null; from: Zone; to: Zone; how: MoveHow; actor?: PlayerId }
  | { kind: 'shuffle'; count: number }
  | { kind: 'turn'; player: PlayerId; number: number }
  | { kind: 'say'; text: string; actor?: PlayerId; affects?: PlayerId[]; notice?: boolean }
  | { kind: 'protected'; card: InstanceId; by: InstanceId | null }
  | { kind: 'win'; player: PlayerId };
export type GameEvent = { seq: number } & GameEventBody;

export interface GameState {
  seed: number;
  rng: number;
  players: Player[];
  unicornsToWin: number;
  cards: Record<InstanceId, CardInstance>;
  deck: InstanceId[];
  discard: InstanceId[];
  nursery: InstanceId[];
  /** cards that have been played and are resolving (on the stack or mid-effect). */
  limbo: InstanceId[];
  turn: Turn;
  stack: StackItem[];
  pending: Pending | null;
  effectQueue: PendingEffect[];
  nextPromptId: number;
  log: LogEntry[];
  /** everything that happened, for the UI to animate; see GameEvent */
  events: GameEvent[];
  winner: PlayerId | null;
  twoPlayerVariant: boolean;
}

export type Action =
  | { type: 'play'; player: PlayerId; card: InstanceId; targetPlayer?: PlayerId }
  | { type: 'draw'; player: PlayerId }
  | { type: 'neigh'; player: PlayerId; card: InstanceId }
  | { type: 'pass'; player: PlayerId }
  | { type: 'respond'; player: PlayerId; promptId: number; answer: Answer }
  /** beginning of turn: use one card's effect now, or `card: null` to stop and draw */
  | { type: 'beginTurn'; player: PlayerId; card: InstanceId | null };

export type RemovalKind = 'destroy' | 'sacrifice' | 'returnToHand';

export interface RemovalEvent {
  kind: RemovalKind;
  card: InstanceId;
  owner: PlayerId;
  /** the card whose effect is causing this, if any. */
  source?: InstanceId;
  /** true when the source is a Magic card (Magical Kittencorn cares). */
  byMagic: boolean;
  /** the player whose effect caused the removal. */
  actor: PlayerId;
}
