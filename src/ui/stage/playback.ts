// Pure helpers for staging the engine's event stream on the client.
//
// A new PlayerView arrives with everything already moved. To play the moves one at a time, the table
// first shows `rewind(view, fresh)` — the view as it was before the fresh events — and then applies the
// events one by one with `applyEvent`. Hidden zones (the deck, other hands) are counts, so a move in
// or out of them only changes a number; visible zones are id lists.
import type { GameEvent, InstanceId, Zone } from '../../engine/types';
import type { PlayerView } from '../../engine/view';

export type MoveEvent = Extract<GameEvent, { kind: 'move' }>;

/** events in `view` newer than `lastSeq` */
export function freshEvents(view: PlayerView, lastSeq: number): GameEvent[] {
  return view.events.filter((e) => e.seq > lastSeq);
}

function take(view: PlayerView, zone: Zone, card: InstanceId | null): void {
  switch (zone.zone) {
    case 'deck': view.deckCount = Math.max(0, view.deckCount - 1); return;
    case 'hand': {
      const p = view.players[zone.player]!;
      p.handCount = Math.max(0, p.handCount - 1);
      if (p.hand && card !== null) p.hand = p.hand.filter((c) => c !== card);
      return;
    }
    case 'stable': {
      const p = view.players[zone.player]!;
      if (card !== null) p.stable = p.stable.filter((c) => c !== card);
      return;
    }
    default:
      if (card !== null) view[zone.zone] = view[zone.zone].filter((c) => c !== card);
  }
}

function put(view: PlayerView, zone: Zone, card: InstanceId | null): void {
  switch (zone.zone) {
    case 'deck': view.deckCount++; return;
    case 'hand': {
      const p = view.players[zone.player]!;
      p.handCount++;
      if (p.hand && card !== null && !p.hand.includes(card)) p.hand = [...p.hand, card];
      return;
    }
    case 'stable': {
      const p = view.players[zone.player]!;
      if (card !== null && !p.stable.includes(card)) p.stable = [...p.stable, card];
      return;
    }
    default:
      if (card !== null && !view[zone.zone].includes(card)) view[zone.zone] = [...view[zone.zone], card];
  }
}

function copyZones(view: PlayerView): PlayerView {
  return {
    ...view,
    discard: [...view.discard], nursery: [...view.nursery], limbo: [...view.limbo],
    players: view.players.map((p) => ({ ...p, stable: [...p.stable], hand: p.hand ? [...p.hand] : null })),
  };
}

/** Redo one event on a copy of the view's zones. Non-zone fields are untouched (except `turn` for a turn event). */
export function applyEvent(view: PlayerView, ev: GameEvent): PlayerView {
  const out = copyZones(view);
  switch (ev.kind) {
    case 'move':
      take(out, ev.from, ev.card);
      put(out, ev.to, ev.card);
      break;
    case 'shuffle':
      out.deckCount += ev.count;
      out.discard = [];
      break;
    case 'turn':
      out.turn = { ...out.turn, player: ev.player, number: ev.number };
      break;
    default:
      break;
  }
  return out;
}

/** Undo one event on a copy of the view's zones. */
export function undoEvent(view: PlayerView, ev: GameEvent): PlayerView {
  const out = copyZones(view);
  switch (ev.kind) {
    case 'move':
      take(out, ev.to, ev.card);
      put(out, ev.from, ev.card);
      break;
    case 'shuffle':
      // the pile's contents are gone from the view; the count is all we can restore
      out.deckCount = Math.max(0, out.deckCount - ev.count);
      break;
    default:
      break;
  }
  return out;
}

/** The view's zones as they were before `fresh` (which must be in seq order). */
export function rewind(view: PlayerView, fresh: GameEvent[]): PlayerView {
  let out = view;
  for (let i = fresh.length - 1; i >= 0; i--) out = undoEvent(out, fresh[i]!);
  return out;
}

/** Is a card face-up for the viewer when it sits in this zone? */
export function faceUpIn(view: PlayerView, zone: Zone): boolean {
  if (zone.zone === 'deck') return false;
  if (zone.zone === 'hand') return view.players[zone.player]!.hand !== null;
  return true;
}
