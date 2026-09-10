// DOM anchors the flyers measure: every visible card, and one element per zone for the hidden or
// pile-shaped ones (deck, discard, nursery, the stage, each player's hand and stable).
import type { InstanceId, Zone } from '../../engine/types';

export const cardKey = (id: InstanceId) => `card:${id}`;
export function zoneKey(zone: Zone): string {
  switch (zone.zone) {
    case 'hand': return `zone:hand:${zone.player}`;
    case 'stable': return `zone:stable:${zone.player}`;
    default: return `zone:${zone.zone}`;
  }
}

export interface Rect { x: number; y: number; w: number; h: number }

export class Anchors {
  private els = new Map<string, HTMLElement>();
  private refs = new Map<string, (el: HTMLElement | null) => void>();

  /** a stable ref callback for `key` (same function identity across renders) */
  ref(key: string): (el: HTMLElement | null) => void {
    let fn = this.refs.get(key);
    if (!fn) {
      fn = (el) => { if (el) this.els.set(key, el); else if (this.els.get(key)) this.els.delete(key); };
      this.refs.set(key, fn);
    }
    return fn;
  }

  has(key: string): boolean { return this.els.has(key); }

  rect(key: string): Rect | null {
    const el = this.els.get(key);
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  /** where a card is (or would be) shown: its own element when visible, else its zone's anchor */
  rectFor(zone: Zone, card: InstanceId | null): Rect | null {
    if (card !== null) { const r = this.rect(cardKey(card)); if (r) return r; }
    return this.rect(zoneKey(zone));
  }
}
