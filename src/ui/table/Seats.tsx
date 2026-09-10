// The other players, in one horizontally scrolling row of fixed height, ordered from whoever's turn it is
// (turn order continues to the right, skipping me). When the turn moves, seats slide to their new places.
import { useLayoutEffect, useRef } from 'react';
import type { CardData, InstanceId, PlayerId } from '../../engine/types';
import type { PlayerView } from '../../engine/view';
import type { SeatInfo } from '../seats';
import { avatarFor } from '../avatars';
import { Avatar } from './Avatar';
import { CardTile } from './CardFace';
import { Anchors, cardKey, zoneKey } from '../stage/anchors';
import type { Bubble } from '../stage/useStage';
import { reducedMotion } from '../stage/motion';

/** the other players, starting from the current turn and following turn order */
export function seatOrder(view: PlayerView): PlayerId[] {
  const n = view.players.length;
  const out: PlayerId[] = [];
  for (let i = 0; i < n; i++) {
    const p = (view.turn.player + i) % n;
    if (p !== view.me) out.push(p);
  }
  return out;
}

export function Seats({ view, seats, anchors, hidden, fx, bubbles, hit, onOpen, data, dropOver }: {
  view: PlayerView; seats: SeatInfo[]; anchors: Anchors; hidden: ReadonlySet<InstanceId>; fx: ReadonlyMap<string, 'shake' | 'shield'>;
  bubbles: Bubble[]; hit: ReadonlySet<PlayerId>; onOpen: (p: PlayerId) => void; data: (id: InstanceId) => CardData;
  /** the seat a lifted card is hovering over, if any */
  dropOver?: PlayerId | null;
}) {
  const others = seatOrder(view);
  const row = useRef<HTMLElement>(null);
  const els = useRef(new Map<PlayerId, HTMLDivElement>());
  const lastRects = useRef(new Map<PlayerId, DOMRect>());
  const orderKey = others.join(',');

  // FLIP: seats that changed place slide from where they were to where they are now
  useLayoutEffect(() => {
    const prev = lastRects.current;
    const next = new Map<PlayerId, DOMRect>();
    for (const [p, el] of els.current) next.set(p, el.getBoundingClientRect());
    if (!reducedMotion()) {
      for (const [p, el] of els.current) {
        const a = prev.get(p); const b = next.get(p);
        if (!a || !b) continue;
        const dx = a.left - b.left;
        if (Math.abs(dx) < 2) continue;
        el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], { duration: 520, easing: 'cubic-bezier(.22,.8,.3,1)' });
      }
    }
    lastRects.current = next;
    row.current?.scrollTo({ left: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [orderKey]);

  return (
    <section className={`seats n-${others.length}`} aria-label="Other players" ref={row}>
      {others.map((p) => {
        const pl = view.players[p]!;
        const seat = seats[p] ?? { name: pl.name, kind: 'human' as const, connected: true };
        const av = avatarFor(seat, p);
        const active = view.turn.player === p && view.winner === null;
        const bubble = bubbles.find((b) => b.player === p);
        const backs = Math.min(pl.handCount, 8);
        return (
          <div
            className={`tseat ${active ? 'active' : ''} ${dropOver === p ? 'drop-over' : ''}`}
            key={p}
            data-seat={p}
            ref={(el) => { if (el) els.current.set(p, el); else els.current.delete(p); }}
          >
            <button type="button" className="tseat-btn" onClick={() => onOpen(p)} aria-label={`${pl.name}: ${view.unicornCounts[p]} unicorns, ${pl.handCount} cards in hand. Open stable`}>
              <Avatar avatar={av} active={active} hit={hit.has(p)} offline={seat.kind === 'human' && seat.connected === false} anchorRef={anchors.ref(`avatar:${p}`)} />
              <span className="tseat-name">
                <span className="tseat-who">{pl.name}</span>
                <span className="tseat-count" aria-hidden="true"><b>{view.unicornCounts[p]}</b><small>/{view.unicornsToWin}</small></span>
                {seat.kind === 'human' && seat.connected === false ? <span className="ts-tag off">offline</span> : null}
              </span>
              <span className="tseat-hand" ref={anchors.ref(zoneKey({ zone: 'hand', player: p }))} aria-hidden="true">
                {Array.from({ length: backs }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}
                {pl.handCount > 0 && <em>{pl.handCount}</em>}
              </span>
            </button>
            <div className="tseat-stable" ref={anchors.ref(zoneKey({ zone: 'stable', player: p }))} style={{ '--n': pl.stable.length } as React.CSSProperties}>
              {pl.stable.map((c) => (
                <CardTile key={c} data={data(c)} anchorRef={anchors.ref(cardKey(c))} hidden={hidden.has(c)} fx={fx.get(cardKey(c))} onClick={() => onOpen(p)} />
              ))}
            </div>
            {bubble && <div className="bubble" key={bubble.id} role="status">{bubble.text}</div>}
          </div>
        );
      })}
    </section>
  );
}
