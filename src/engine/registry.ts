import type {
  CardData, CardId, GameState, InstanceId, PlayerId, RemovalEvent,
} from './types';
import type { Ctx } from './effects';
import baseSet from '../../data/base-set-2e.json';

export interface CardDef {
  id: CardId;
  data: CardData;

  // --- queued triggers (run through the prompt/replay machinery) ---
  onEnter?(ctx: Ctx): void;
  onBeginTurn?(ctx: Ctx): void;
  /** fires after a real (non-replaced) sacrifice or destroy of this card. */
  onLeave?(ctx: Ctx): void;
  onPlayMagic?(ctx: Ctx): void;
  /** a Unicorn entered/left the stable this card sits in. payload.unicorn */
  onUnicornEntered?(ctx: Ctx): void;
  onUnicornLeft?(ctx: Ctx): void;
  /** any change to the stable this card sits in. */
  onStableChanged?(ctx: Ctx): void;

  // --- synchronous replacement / immunity hooks (may call ctx.choose inline) ---
  /** this card itself would be removed. */
  replaceRemoval?(ctx: Ctx, ev: RemovalEvent): 'immune' | 'replaced' | null;
  /** another card in the same stable would be removed. */
  protectOther?(ctx: Ctx, ev: RemovalEvent): 'immune' | 'replaced' | null;

  // --- static queries ---
  /** how many Unicorns this card counts as (default 1 for unicorns). */
  unicornValue?(state: GameState, card: InstanceId, owner: PlayerId): number;
  /** veto a play by this card's controller. Return a reason string to veto. */
  vetoPlay?(state: GameState, controller: PlayerId, card: InstanceId): string | null;
  /** global veto on a card entering a stable. */
  vetoEntry?(state: GameState, controller: PlayerId, card: InstanceId, into: PlayerId): string | null;
  /** cards played by this card's controller cannot be Neigh'd. */
  neighImmunity?: boolean;
  /** "immediately end your turn"-style flags are handled through ctx. */
}

const defs = new Map<CardId, CardDef>();
export const cardData = new Map<CardId, CardData>();
for (const c of (baseSet as { cards: CardData[] }).cards) cardData.set(c.id, c);

export function defineCard(id: CardId, def: Omit<CardDef, 'id' | 'data'>): CardDef {
  const data = cardData.get(id);
  if (!data) throw new Error(`Unknown card id ${id}`);
  if (defs.has(id)) throw new Error(`Duplicate card definition ${id}`);
  const full: CardDef = { id, data, ...def };
  defs.set(id, full);
  return full;
}

export function getDef(id: CardId): CardDef {
  const d = defs.get(id);
  if (!d) throw new Error(`No definition registered for ${id}`);
  return d;
}

export function hasDef(id: CardId): boolean {
  return defs.has(id);
}

export function allCardData(): CardData[] {
  return [...cardData.values()];
}

export function definedIds(): CardId[] {
  return [...defs.keys()];
}
