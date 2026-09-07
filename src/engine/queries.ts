import type { GameState, InstanceId, PlayerId, CardData, CardType } from './types';
import { cardData, getDef, hasDef } from './registry';

export function dataOf(state: GameState, card: InstanceId): CardData {
  const inst = state.cards[card];
  if (!inst) throw new Error(`Unknown card instance ${card}`);
  const d = cardData.get(inst.def);
  if (!d) throw new Error(`Unknown card def ${inst.def}`);
  return d;
}

export function defOf(state: GameState, card: InstanceId) {
  return getDef(state.cards[card]!.def);
}

export function typeOf(state: GameState, card: InstanceId): CardType {
  return dataOf(state, card).type;
}

export function nameOf(state: GameState, card: InstanceId): string {
  return dataOf(state, card).name;
}

export function isUnicornType(t: CardType): boolean {
  return t === 'baby_unicorn' || t === 'basic_unicorn' || t === 'magical_unicorn';
}

export function isNeighCard(state: GameState, card: InstanceId): boolean {
  return typeOf(state, card) === 'instant';
}

export type Zone =
  | { zone: 'hand'; player: PlayerId }
  | { zone: 'stable'; player: PlayerId }
  | { zone: 'deck' } | { zone: 'discard' } | { zone: 'nursery' } | { zone: 'limbo' };

export function zoneOf(state: GameState, card: InstanceId): Zone {
  for (const p of state.players) {
    if (p.hand.includes(card)) return { zone: 'hand', player: p.id };
    if (p.stable.includes(card)) return { zone: 'stable', player: p.id };
  }
  if (state.deck.includes(card)) return { zone: 'deck' };
  if (state.discard.includes(card)) return { zone: 'discard' };
  if (state.nursery.includes(card)) return { zone: 'nursery' };
  if (state.limbo.includes(card)) return { zone: 'limbo' };
  throw new Error(`Card ${card} is in no zone`);
}

/** player whose stable holds the card, or null. */
export function stableOwner(state: GameState, card: InstanceId): PlayerId | null {
  for (const p of state.players) if (p.stable.includes(card)) return p.id;
  return null;
}

export function stableHas(state: GameState, player: PlayerId, defId: string): boolean {
  return state.players[player]!.stable.some((c) => state.cards[c]!.def === defId);
}

/** Blinding Light: the controller's Unicorn effects are ignored (Baby Unicorns exempt). */
export function isBlinded(state: GameState, card: InstanceId): boolean {
  const owner = stableOwner(state, card);
  if (owner === null) return false;
  const t = typeOf(state, card);
  if (!isUnicornType(t) || t === 'baby_unicorn') return false;
  return stableHas(state, owner, 'blinding-light');
}

/** Pandamonium: the controller's Unicorns are Pandas, not Unicorn cards. */
export function isPanda(state: GameState, card: InstanceId): boolean {
  const owner = stableOwner(state, card);
  if (owner === null) return false;
  return isUnicornType(typeOf(state, card)) && stableHas(state, owner, 'pandamonium');
}

/** "Unicorn card" for targeting purposes: a unicorn in a stable that is not a Panda. */
export function isUnicornCardInStable(state: GameState, card: InstanceId): boolean {
  return stableOwner(state, card) !== null && isUnicornType(typeOf(state, card)) && !isPanda(state, card);
}

/** Effects of a card in a stable are active unless blinded. */
export function effectsActive(state: GameState, card: InstanceId): boolean {
  return !isBlinded(state, card);
}

export function unicornValue(state: GameState, card: InstanceId, owner: PlayerId): number {
  const t = typeOf(state, card);
  if (!isUnicornType(t)) return 0;
  if (isPanda(state, card)) return 0;
  const def = defOf(state, card);
  if (def.unicornValue && effectsActive(state, card)) return def.unicornValue(state, card, owner);
  return 1;
}

export function unicornCount(state: GameState, player: PlayerId): number {
  return state.players[player]!.stable.reduce((n, c) => n + unicornValue(state, c, player), 0);
}

/** raw number of unicorn-type cards in a stable (Tiny Stable uses unicornCount instead). */
export function unicornsIn(state: GameState, player: PlayerId): InstanceId[] {
  return state.players[player]!.stable.filter((c) => isUnicornType(typeOf(state, c)));
}

export function cardsOfType(state: GameState, player: PlayerId, type: CardType): InstanceId[] {
  return state.players[player]!.stable.filter((c) => typeOf(state, c) === type);
}

export function others(state: GameState, player: PlayerId): PlayerId[] {
  return state.players.map((p) => p.id).filter((id) => id !== player);
}

/** players in turn order starting from `from`. */
export function playersFrom(state: GameState, from: PlayerId): PlayerId[] {
  const n = state.players.length;
  return Array.from({ length: n }, (_, i) => (from + i) % n);
}

/** reason a player may not play a given card from hand right now (ignoring phase/pending). */
export function vetoPlay(state: GameState, player: PlayerId, card: InstanceId): string | null {
  const t = typeOf(state, card);
  if (t === 'baby_unicorn') return 'Baby Unicorns are never played from hand';
  for (const c of state.players[player]!.stable) {
    const def = defOf(state, c);
    if (def.vetoPlay && effectsActive(state, c)) {
      const r = def.vetoPlay(state, player, card);
      if (r) return r;
    }
  }
  if (isUnicornType(t)) {
    const r = vetoEntry(state, card, player);
    if (r) return r;
  }
  return null;
}

/** global vetoes on a card entering a stable (Queen Bee). */
export function vetoEntry(state: GameState, card: InstanceId, into: PlayerId): string | null {
  for (const p of state.players) {
    for (const c of p.stable) {
      const def = defOf(state, c);
      if (def.vetoEntry && effectsActive(state, c)) {
        const r = def.vetoEntry(state, p.id, card, into);
        if (r) return r;
      }
    }
  }
  return null;
}

export function canPlayNeigh(state: GameState, player: PlayerId): boolean {
  const anyNeigh = state.players[player]!.hand.find((c) => isNeighCard(state, c));
  if (anyNeigh === undefined) {
    // veto check with a hypothetical Neigh: use the first Neigh def id
    return false;
  }
  return vetoPlay(state, player, anyNeigh) === null;
}

/** could this player be asked to Neigh (public-information check only)? */
export function neighAllowed(state: GameState, player: PlayerId): boolean {
  for (const c of state.players[player]!.stable) {
    const def = defOf(state, c);
    if (def.vetoPlay && effectsActive(state, c)) {
      // probe with a synthetic instant card lookup: any Neigh instance in the game will do
      const probe = Object.values(state.cards).find((i) => cardData.get(i.def)?.type === 'instant');
      if (probe && def.vetoPlay(state, player, probe.id)) return false;
    }
  }
  return true;
}

export function hasNeighImmunity(state: GameState, player: PlayerId): boolean {
  return state.players[player]!.stable.some((c) => defOf(state, c).neighImmunity && effectsActive(state, c));
}

export function allImplemented(): string[] {
  return [...cardData.keys()].filter((id) => !hasDef(id));
}

export function totalInstances(state: GameState): number {
  let n = state.deck.length + state.discard.length + state.nursery.length + state.limbo.length;
  for (const p of state.players) n += p.hand.length + p.stable.length;
  return n;
}
