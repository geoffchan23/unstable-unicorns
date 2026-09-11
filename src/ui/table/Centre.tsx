// The middle of the table: the deck, the stage where a played card sits, and the discard/nursery piles
// stacked in one column beside it.
import { useLayoutEffect, useRef, useState } from 'react';
import type { CardData, InstanceId } from '../../engine/types';
import type { PlayerView } from '../../engine/view';
import { Anchors, cardKey, zoneKey } from '../stage/anchors';
import type { Stamp } from '../stage/useStage';
import { CardBack, CardTile } from './CardFace';
import { CardView } from '../Card';

const CARD_W = 168;
const CARD_H = 288;
/** a Neigh is drawn at this fraction of the played card... */
const CHAIN_SCALE = 0.62;
/** ...and this much of it sticks out past the card's right edge, in unscaled card widths */
const CHAIN_OVERHANG = 74;
const MAX_Z = 1;

export function Centre({ view, anchors, hidden, fx, stamps, data, onOpenCard, drop }: {
  view: PlayerView; anchors: Anchors; hidden: ReadonlySet<InstanceId>; fx: ReadonlyMap<string, 'shake' | 'shield'>;
  stamps: Stamp[]; data: (id: InstanceId) => CardData; onOpenCard: (id: InstanceId) => void;
  /** 'ready' while a card is lifted, 'over' while it hovers the table */
  drop?: 'ready' | 'over' | null;
}) {
  const discardTop = view.discard.length ? view.discard[view.discard.length - 1]! : null;
  const nurseryTop = view.nursery.length ? view.nursery[view.nursery.length - 1]! : null;
  const [base, ...rest] = view.limbo;
  const stageStamps = stamps.filter((s) => s.key === zoneKey({ zone: 'limbo' }));

  /**
   * How big the played card may be, measured rather than guessed. A card is a fixed 168x288 box drawn at
   * `scale(--z)`, and a transform does not change layout: CSS can cap the *box* against the panel all it
   * likes while the card itself keeps overflowing. So the stage is measured and the scale comes from the
   * room it actually has, with a Neigh chain (which hangs off the card's right edge) accounted for.
   */
  const stage = useRef<HTMLDivElement | null>(null);
  const [z, setZ] = useState(0.7);
  const chained = rest.length > 0;
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (!r.height || !r.width) return;
      const widthPerCard = chained ? CARD_W + CHAIN_OVERHANG : CARD_W;
      setZ(Math.max(0.28, Math.min(MAX_Z, r.height / CARD_H, r.width / widthPerCard)));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [chained]);
  const vars = { '--z': z, '--nz': z * CHAIN_SCALE } as React.CSSProperties;
  return (
    <section className={`centre ${drop ? `drop-${drop}` : ''}`} aria-label="Table">
      <div className="pile deck" aria-label={`Deck: ${view.deckCount} cards`}>
        <span className="pile-name">Deck <b>({view.deckCount})</b></span>
        <div className="pile-stack" ref={anchors.ref(zoneKey({ zone: 'deck' }))}>
          {view.deckCount > 2 && <CardBack className="under under-2" />}
          {view.deckCount > 1 && <CardBack className="under under-1" />}
          {view.deckCount > 0 ? <CardBack /> : <div className="pile-empty" />}
        </div>
      </div>

      <div className="stage" ref={(el) => { stage.current = el; anchors.ref(zoneKey({ zone: 'limbo' }))(el); }}>
        {base !== undefined ? (
          <div className="stage-cards" style={vars}>
            <div className={`stage-base ${hidden.has(base) ? 'is-hidden' : ''}`} ref={anchors.ref(cardKey(base))}>
              <div className="scaled"><CardView data={data(base)} onClick={() => onOpenCard(base)} /></div>
            </div>
            {rest.length > 0 && (
              <div className="stage-chain">
                {rest.map((c, i) => (
                  <div key={c} className={`stage-neigh ${hidden.has(c) ? 'is-hidden' : ''}`} style={{ '--i': i } as React.CSSProperties} ref={anchors.ref(cardKey(c))}>
                    <div className="scaled"><CardView data={data(c)} onClick={() => onOpenCard(c)} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="stage-empty" aria-hidden="true">{drop && <span className="drop-hint">{drop === 'over' ? 'Let go to play' : 'Drop here to play'}</span>}</div>
        )}
        {stageStamps.map((s) => <span key={s.id} className="stamp">{s.text}</span>)}
      </div>

      <div className="piles">
        <div className="pile discard" aria-label={`Discard pile: ${view.discard.length} cards`}>
          <span className="pile-name">Discard <b>({view.discard.length})</b></span>
          <div className="pile-stack" ref={anchors.ref(zoneKey({ zone: 'discard' }))}>
            {discardTop !== null
              ? <CardTile data={data(discardTop)} onClick={() => onOpenCard(discardTop)} anchorRef={anchors.ref(cardKey(discardTop))} hidden={hidden.has(discardTop)} fx={fx.get(cardKey(discardTop))} className="tile-lg" />
              : <div className="pile-empty" />}
          </div>
        </div>

        <div className="pile nursery" aria-label={`Nursery: ${view.nursery.length} baby unicorns`}>
          <span className="pile-name">Nursery <b>({view.nursery.length})</b></span>
          <div className="pile-stack" ref={anchors.ref(zoneKey({ zone: 'nursery' }))}>
            {nurseryTop !== null
              ? <CardTile data={data(nurseryTop)} onClick={() => onOpenCard(nurseryTop)} anchorRef={anchors.ref(cardKey(nurseryTop))} hidden={hidden.has(nurseryTop)} className="tile-lg" />
              : <div className="pile-empty" />}
          </div>
        </div>
      </div>
    </section>
  );
}
