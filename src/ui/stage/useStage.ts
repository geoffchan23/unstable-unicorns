// Staged playback: keeps a `shown` view that lags behind the real one and plays the engine's events one
// at a time — a card flies (Flyer), a bubble appears by whoever spoke, the turn banner sweeps in.
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { cardData } from '../../engine/registry';
import type { GameEvent, InstanceId, PlayerId, Zone } from '../../engine/types';
import type { PlayerView } from '../../engine/view';
import { Anchors, cardKey, zoneKey, type Rect } from './anchors';
import type { FlyerSpec } from './Flyer';
import { stageBusy } from './busy';
import { BUBBLE_MS, PROTECT_MS, SAY_GAP_MS, SHUFFLE_MS, TURN_BANNER_MS, flightMs, holdMs, nextFrame, reducedMotion, wait, windupMs } from './motion';
import { applyEvent, faceUpIn, freshEvents } from './playback';
import { rewind } from './playback';

export interface Bubble { id: number; player: PlayerId; text: string }
export interface Banner { id: number; player: PlayerId; number: number }
export interface Stamp { id: number; text: string; key: string }

export interface Stage {
  shown: PlayerView;
  busy: boolean;
  anchors: Anchors;
  /** cards whose slot is rendered but invisible because a flyer is carrying them */
  hidden: ReadonlySet<InstanceId>;
  /** cards shaking (about to be destroyed) or glowing (protected) */
  fx: ReadonlyMap<string, 'shake' | 'shield'>;
  flyers: FlyerSpec[];
  bubbles: Bubble[];
  banner: Banner | null;
  stamps: Stamp[];
  /** players who just got hit (their avatar shakes) */
  hit: ReadonlySet<PlayerId>;
  /** notices (say events flagged notice) to toast */
  notice: { id: number; text: string } | null;
}

/** never replay more than this many events at once (a reconnect after a long gap just snaps) */
const MAX_REPLAY = 48;

export function useStage(view: PlayerView): Stage {
  const anchors = useMemo(() => new Anchors(), []);
  const [shown, setShown] = useState<PlayerView>(view);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState<Set<InstanceId>>(() => new Set());
  const [fx, setFx] = useState<Map<string, 'shake' | 'shield'>>(() => new Map());
  const [flyers, setFlyers] = useState<FlyerSpec[]>([]);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [hit, setHit] = useState<Set<PlayerId>>(() => new Set());
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);

  const target = useRef(view);
  const shownRef = useRef(view);
  const lastSeq = useRef(view.events.length ? view.events[view.events.length - 1]!.seq : -1);
  const queue = useRef<GameEvent[]>([]);
  const playing = useRef(false);
  const ids = useRef(1);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; stageBusy.set(false); }, []);

  const show = (v: PlayerView) => { shownRef.current = v; setShown(v); };

  useEffect(() => {
    target.current = view;
    // a different viewer (hot-seat handoff) or a brand-new game: no playback, just show it
    if (view.me !== shownRef.current.me || view.events.length < lastSeq.current) {
      queue.current = [];
      lastSeq.current = view.events.length ? view.events[view.events.length - 1]!.seq : -1;
      show(view);
      return;
    }
    const fresh = freshEvents(view, lastSeq.current);
    if (fresh.length) lastSeq.current = fresh[fresh.length - 1]!.seq;
    if (reducedMotion()) {
      // no staging at all: the picture is the engine's, and the table is never busy
      queue.current = [];
      if (!playing.current) {
        for (const e of fresh) if (e.kind === 'say' && e.notice) setNotice({ id: ids.current++, text: e.text });
        show(view);
      }
      return;
    }
    if (fresh.length === 0 || fresh.length > MAX_REPLAY) {
      if (!playing.current) show(view);
      else if (fresh.length > MAX_REPLAY) { queue.current = []; }
      return;
    }
    if (!playing.current) {
      const prev = shownRef.current;
      const base = rewind(view, fresh);
      // carry what the old picture said about the things events do not move
      show({
        ...base,
        pending: null,
        stack: prev.stack,
        winner: prev.winner,
        turn: prev.turn,
        unicornCounts: prev.unicornCounts,
        playBlocks: prev.playBlocks,
        players: base.players.map((p, i) => (prev.players[i]?.hand === null ? { ...p, hand: null } : p)),
      });
      queue.current.push(...fresh);
      void run();
    } else {
      queue.current.push(...fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  async function run() {
    playing.current = true;
    stageBusy.set(true);
    setBusy(true);
    // leave the effect before touching the DOM synchronously
    await wait(0);
    try {
      while (alive.current && queue.current.length) {
        const ev = queue.current.shift()!;
        await playOne(ev);
      }
    } finally {
      playing.current = false;
      if (alive.current) {
        show(target.current);
        setHidden(new Set());
        setFlyers([]);
        setBusy(false);
      }
      stageBusy.set(false);
    }
  }

  function commit(v: PlayerView) {
    if (!alive.current) return;
    flushSync(() => show(v));
  }

  async function playOne(ev: GameEvent): Promise<void> {
    const quick = reducedMotion();
    switch (ev.kind) {
      case 'say': {
        if (ev.notice) { setNotice({ id: ids.current++, text: ev.text }); return; }
        if (ev.actor !== undefined && !/^---/.test(ev.text)) {
          const id = ids.current++;
          setBubbles((bs) => [...bs.filter((b) => b.player !== ev.actor), { id, player: ev.actor!, text: ev.text }]);
          setTimeout(() => alive.current && setBubbles((bs) => bs.filter((b) => b.id !== id)), quick ? 1200 : BUBBLE_MS);
        }
        if (ev.affects?.length) {
          setHit(new Set(ev.affects));
          setTimeout(() => alive.current && setHit(new Set()), 600);
        }
        if (!quick) await wait(SAY_GAP_MS);
        return;
      }
      case 'turn': {
        commit(applyEvent(shownRef.current, ev));
        if (quick) return;
        setBanner({ id: ids.current++, player: ev.player, number: ev.number });
        await wait(TURN_BANNER_MS);
        setBanner(null);
        return;
      }
      case 'shuffle': {
        const from = anchors.rect(zoneKey({ zone: 'discard' }));
        const to = anchors.rect(zoneKey({ zone: 'deck' }));
        commit(applyEvent(shownRef.current, ev));
        if (quick || !from || !to) return;
        const id = ids.current++;
        setFlyers((fs) => [...fs, { id, data: null, from, to, faceFrom: false, faceTo: false, how: 'deckTop', ms: SHUFFLE_MS }]);
        await wait(SHUFFLE_MS);
        setFlyers((fs) => fs.filter((f) => f.id !== id));
        return;
      }
      case 'protected': {
        if (quick) return;
        const key = cardKey(ev.card);
        setFx((m) => new Map(m).set(key, 'shield'));
        await wait(PROTECT_MS);
        setFx((m) => { const n = new Map(m); n.delete(key); return n; });
        return;
      }
      case 'win':
        return;
      case 'move':
        await playMove(ev, quick);
        return;
      default:
        return;
    }
  }

  async function playMove(ev: Extract<GameEvent, { kind: 'move' }>, quick: boolean): Promise<void> {
    const before = shownRef.current;
    const card = ev.card;
    const data = card !== null ? cardData.get(before.cards[card]?.def ?? '') ?? null : null;
    const faceFrom = card !== null && faceUpIn(before, ev.from);
    const next = applyEvent(before, ev);
    const faceTo = card !== null && faceUpIn(next, ev.to);
    if (quick) { commit(next); return; }

    // wind-up: the card about to be destroyed shakes in place
    const windup = windupMs(ev.how);
    if (windup && card !== null) {
      setFx((m) => new Map(m).set(cardKey(card), 'shake'));
      await wait(windup);
      setFx((m) => { const n = new Map(m); n.delete(cardKey(card)); return n; });
    }

    const from = cardShaped(anchors.rectFor(ev.from, faceFrom ? card : null));
    if (card !== null && faceTo) setHidden((h) => new Set(h).add(card));
    commit(next);
    await nextFrame();
    const to = cardShaped(anchors.rectFor(ev.to, faceTo ? card : null));
    const unhide = () => { if (card !== null) setHidden((h) => { const n = new Set(h); n.delete(card); return n; }); };
    if (!from || !to) { unhide(); return; }

    const ms = flightMs(ev.how);
    const id = ids.current++;
    setFlyers((fs) => [...fs, { id, data, from, to, faceFrom, faceTo, how: ev.how, ms }]);
    await wait(ms);
    setFlyers((fs) => fs.filter((f) => f.id !== id));
    unhide();

    if (ev.how === 'neigh') {
      const sid = ids.current++;
      setStamps((s) => [...s, { id: sid, text: 'NEIGH!', key: zoneKey({ zone: 'limbo' }) }]);
      await wait(holdMs(ev.how));
      setStamps((s) => s.filter((x) => x.id !== sid));
      return;
    }
    await wait(holdMs(ev.how));
  }

  return { shown, busy, anchors, hidden, fx, flyers, bubbles, banner, stamps, hit, notice };
}

/** a rect with the card's 7:12 shape, centred on the anchor (tiles and piles are not card-shaped) */
function cardShaped(r: Rect | null): Rect | null {
  if (!r) return r;
  const h = r.w * 288 / 168;
  return { x: r.x, y: r.y + (r.h - h) / 2, w: r.w, h };
}

/** the zone a card is displayed in, for a view (used by the table to pick anchors) */
export function zoneOfShown(view: PlayerView, card: InstanceId): Zone | null {
  for (const p of view.players) {
    if (p.stable.includes(card)) return { zone: 'stable', player: p.id };
    if (p.hand?.includes(card)) return { zone: 'hand', player: p.id };
  }
  if (view.discard.includes(card)) return { zone: 'discard' };
  if (view.nursery.includes(card)) return { zone: 'nursery' };
  if (view.limbo.includes(card)) return { zone: 'limbo' };
  return null;
}
