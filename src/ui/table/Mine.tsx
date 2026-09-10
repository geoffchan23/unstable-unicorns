// My side of the table: avatar + stable thumbnails on one row, the hand as a fan below, the draw button.
import { useLayoutEffect, useRef, useState } from 'react';
import type { CardData, InstanceId } from '../../engine/types';
import type { PlayerView } from '../../engine/view';
import type { SeatInfo } from '../seats';
import { avatarFor } from '../avatars';
import { Anchors, cardKey, zoneKey } from '../stage/anchors';
import type { Bubble } from '../stage/useStage';
import { Avatar } from './Avatar';
import { CardTile } from './CardFace';
import { CardView } from '../Card';

export function Mine({ view, seats, anchors, hidden, fx, bubbles, hit, myTurn, playable, canDraw, hand, onReorder, onDraw, onOpenCard, onOpenHandCard, onOpenStable, data, youLabel }: {
  view: PlayerView; seats: SeatInfo[]; anchors: Anchors; hidden: ReadonlySet<InstanceId>; fx: ReadonlyMap<string, 'shake' | 'shield'>;
  bubbles: Bubble[]; hit: ReadonlySet<number>; myTurn: boolean; playable: Set<InstanceId>; canDraw: boolean;
  /** my hand in the order I arranged it */
  hand: InstanceId[]; onReorder: (order: InstanceId[]) => void;
  onDraw: () => void; onOpenCard: (id: InstanceId) => void; onOpenHandCard: (id: InstanceId) => void; onOpenStable: () => void;
  data: (id: InstanceId) => CardData; youLabel: string;
}) {
  const me = view.players[view.me]!;
  const seat = seats[view.me] ?? { name: me.name, kind: 'human' as const, connected: true };
  const av = avatarFor(seat, view.me);
  const active = view.turn.player === view.me && view.winner === null;
  const bubble = bubbles.find((b) => b.player === view.me);
  return (
    <section className="mine" aria-label="You">
      <div className={`my-row ${active ? 'active' : ''}`}>
        <button type="button" className="my-id" onClick={onOpenStable} data-testid="stable-toggle" aria-label="Open your stable">
          <Avatar avatar={av} size="sm" active={active} hit={hit.has(view.me)} anchorRef={anchors.ref(`avatar:${view.me}`)} />
          <span className="my-name">{me.name}{youLabel}</span>
          <span className="my-count"><b>{view.unicornCounts[view.me]}</b><small>/{view.unicornsToWin}</small></span>
        </button>
        <div className="my-stable" ref={anchors.ref(zoneKey({ zone: 'stable', player: view.me }))}>
          {me.stable.length === 0 && <span className="my-empty">Your stable is empty. Play a Unicorn!</span>}
          {me.stable.map((c) => (
            <CardTile key={c} data={data(c)} anchorRef={anchors.ref(cardKey(c))} hidden={hidden.has(c)} fx={fx.get(cardKey(c))} onClick={() => onOpenCard(c)} className="tile-md" />
          ))}
        </div>
        {bubble && <div className="bubble mine-bubble" key={bubble.id} role="status">{bubble.text}</div>}
      </div>

      <div className="hand-bar">
        <span className="hand-cue">
          {myTurn ? (view.turn.playsRemaining > 1 ? `Your turn: play a card (${view.turn.playsRemaining} left)` : 'Your turn: play a card, or draw') : `${hand.length} in hand`}
        </span>
        {myTurn && canDraw && <button type="button" className="primary draw-btn" data-testid="draw" onClick={onDraw}>Draw a card</button>}
      </div>

      <Fan hand={hand} onReorder={onReorder} anchors={anchors} hidden={hidden} playable={playable} myTurn={myTurn} onOpenCard={onOpenHandCard} data={data} me={view.me} />
    </section>
  );
}

const CARD_W = 168;

/** The hand, fanned. Tap a card to open it; drag a card sideways to move it. */
function Fan({ hand, onReorder, anchors, hidden, playable, myTurn, onOpenCard, data, me }: {
  hand: InstanceId[]; onReorder: (order: InstanceId[]) => void; anchors: Anchors; hidden: ReadonlySet<InstanceId>; playable: Set<InstanceId>; myTurn: boolean;
  onOpenCard: (id: InstanceId) => void; data: (id: InstanceId) => CardData; me: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const n = hand.length;
  const tall = typeof window !== 'undefined' ? window.innerHeight : 900;
  const cw = width >= 720 ? (tall >= 900 ? 168 : 148) : tall < 640 ? 112 : 136;
  const maxStep = cw * 0.72;
  const step = n > 1 ? Math.min(maxStep, Math.max(24, (width - cw - 8) / (n - 1))) : 0;
  const mid = (n - 1) / 2;
  const spread = Math.min(1, step / maxStep); // squeezed fans rotate less

  // dragging: which card and where the pointer is (relative to the fan's centre)
  const [drag, setDrag] = useState<{ card: InstanceId; x: number } | null>(null);
  const press = useRef<{ card: InstanceId; startX: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const centreX = () => { const r = ref.current?.getBoundingClientRect(); return r ? r.left + r.width / 2 : 0; };

  const onPointerDown = (card: InstanceId) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || n < 2) return;
    // no pointer capture yet: capturing here would redirect the click away from the card button
    press.current = { card, startX: e.clientX, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.startX;
    if (!p.moved && Math.abs(dx) < 8) return;
    if (!p.moved) { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } }
    p.moved = true;
    const x = e.clientX - centreX();
    setDrag({ card: p.card, x });
    // the card moves to the slot under the pointer
    const target = Math.max(0, Math.min(n - 1, Math.round(x / (step || 1) + mid)));
    const cur = hand.indexOf(p.card);
    if (target !== cur) {
      const next = hand.filter((c) => c !== p.card);
      next.splice(target, 0, p.card);
      onReorder(next);
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    press.current = null;
    if (p?.moved) { suppressClick.current = true; setTimeout(() => { suppressClick.current = false; }, 0); }
    setDrag(null);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };

  return (
    <div className={`fan ${n > 0 ? '' : 'empty'}`} data-testid="hand" ref={(el) => { (ref as React.MutableRefObject<HTMLDivElement | null>).current = el; anchors.ref(zoneKey({ zone: 'hand', player: me }))(el); }} style={{ '--cw': `${cw}px` } as React.CSSProperties}>
      {hand.map((c, i) => {
        const k = i - mid;
        const can = myTurn && playable.has(c);
        const dragging = drag?.card === c;
        // rotate around the card's centre so every card shows the same sliver; a gentle curve lifts the ends
        const x = dragging ? drag.x : k * step;
        const rot = dragging ? 0 : k * 2.2 * spread;
        const y = dragging ? -18 : Math.abs(k) * Math.abs(k) * 1.6 * spread - (can ? 14 : 0);
        return (
          <div
            key={c}
            className={`fan-slot ${hidden.has(c) ? 'is-hidden' : ''} ${can ? 'can' : ''} ${dragging ? 'dragging' : ''}`}
            style={{ transform: `translateX(${x}px) translateY(${y}px) rotate(${rot}deg)${dragging ? ' scale(1.06)' : ''}`, zIndex: dragging ? 500 : (can ? 100 : 0) + i + 1, '--z': cw / CARD_W } as React.CSSProperties}
            ref={anchors.ref(cardKey(c))}
            onPointerDown={onPointerDown(c)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClickCapture={(e) => { if (suppressClick.current) { e.stopPropagation(); e.preventDefault(); } }}
          >
            <div className="scaled"><CardView data={data(c)} onClick={() => onOpenCard(c)} playable={can} dim={!can} /></div>
          </div>
        );
      })}
    </div>
  );
}
