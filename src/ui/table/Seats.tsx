// The other players, around the top of the table: avatar, name, unicorn count, hand size, stable thumbnails.
import type { CardData, InstanceId, PlayerId } from '../../engine/types';
import type { PlayerView } from '../../engine/view';
import type { SeatInfo } from '../seats';
import { avatarFor } from '../avatars';
import { Avatar } from './Avatar';
import { CardTile } from './CardFace';
import { Anchors, cardKey, zoneKey } from '../stage/anchors';
import type { Bubble } from '../stage/useStage';

export function Seats({ view, seats, anchors, hidden, fx, bubbles, hit, onOpen, data, dropOver }: {
  view: PlayerView; seats: SeatInfo[]; anchors: Anchors; hidden: ReadonlySet<InstanceId>; fx: ReadonlyMap<string, 'shake' | 'shield'>;
  bubbles: Bubble[]; hit: ReadonlySet<PlayerId>; onOpen: (p: PlayerId) => void; data: (id: InstanceId) => CardData;
  /** the seat a lifted card is hovering over, if any */
  dropOver?: PlayerId | null;
}) {
  const others = view.players.filter((p) => p.id !== view.me);
  return (
    <section className={`seats n-${others.length}`} aria-label="Other players">
      {others.map((p) => {
        const seat = seats[p.id] ?? { name: p.name, kind: 'human' as const, connected: true };
        const av = avatarFor(seat, p.id);
        const active = view.turn.player === p.id && view.winner === null;
        const bubble = bubbles.find((b) => b.player === p.id);
        const backs = Math.min(p.handCount, 8);
        return (
          <div className={`tseat ${active ? 'active' : ''} ${dropOver === p.id ? 'drop-over' : ''}`} key={p.id} data-seat={p.id}>
            <button type="button" className="tseat-btn" onClick={() => onOpen(p.id)} aria-label={`${p.name}: ${view.unicornCounts[p.id]} unicorns, ${p.handCount} cards in hand. Open stable`}>
              <Avatar avatar={av} active={active} hit={hit.has(p.id)} offline={seat.kind === 'human' && seat.connected === false} anchorRef={anchors.ref(`avatar:${p.id}`)} />
              <span className="tseat-name">
                <span className="tseat-who">{p.name}</span>
                <span className="tseat-count" aria-hidden="true"><b>{view.unicornCounts[p.id]}</b><small>/{view.unicornsToWin}</small></span>
                {seat.kind === 'human' && seat.connected === false ? <span className="ts-tag off">offline</span> : null}
              </span>
              <span className="tseat-hand" ref={anchors.ref(zoneKey({ zone: 'hand', player: p.id }))} aria-hidden="true">
                {Array.from({ length: backs }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}
                {p.handCount > 0 && <em>{p.handCount}</em>}
              </span>
            </button>
            <div className="tseat-stable" ref={anchors.ref(zoneKey({ zone: 'stable', player: p.id }))}>
              {p.stable.map((c) => (
                <CardTile key={c} data={data(c)} anchorRef={anchors.ref(cardKey(c))} hidden={hidden.has(c)} fx={fx.get(cardKey(c))} onClick={() => onOpen(p.id)} />
              ))}
            </div>
            {bubble && <div className="bubble" key={bubble.id} role="status">{bubble.text}</div>}
          </div>
        );
      })}
    </section>
  );
}
