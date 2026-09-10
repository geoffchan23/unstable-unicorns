// The middle of the table: the deck, the discard pile, the nursery, and the stage where a played card sits.
import type { CardData, InstanceId } from '../../engine/types';
import type { PlayerView } from '../../engine/view';
import { Anchors, cardKey, zoneKey } from '../stage/anchors';
import type { Stamp } from '../stage/useStage';
import { CardBack, CardTile } from './CardFace';
import { CardView } from '../Card';

export function Centre({ view, anchors, hidden, fx, stamps, data, onOpenCard, neighBanner, drop }: {
  view: PlayerView; anchors: Anchors; hidden: ReadonlySet<InstanceId>; fx: ReadonlyMap<string, 'shake' | 'shield'>;
  stamps: Stamp[]; data: (id: InstanceId) => CardData; onOpenCard: (id: InstanceId) => void; neighBanner: string | null;
  /** 'ready' while a card is lifted, 'over' while it hovers the table */
  drop?: 'ready' | 'over' | null;
}) {
  const discardTop = view.discard.length ? view.discard[view.discard.length - 1]! : null;
  const nurseryTop = view.nursery.length ? view.nursery[view.nursery.length - 1]! : null;
  const [base, ...rest] = view.limbo;
  const stageStamps = stamps.filter((s) => s.key === zoneKey({ zone: 'limbo' }));
  return (
    <section className={`centre ${drop ? `drop-${drop}` : ''}`} aria-label="Table">
      <div className="pile deck" aria-label={`Deck: ${view.deckCount} cards`}>
        <div className="pile-stack" ref={anchors.ref(zoneKey({ zone: 'deck' }))}>
          {view.deckCount > 2 && <CardBack className="under under-2" />}
          {view.deckCount > 1 && <CardBack className="under under-1" />}
          {view.deckCount > 0 ? <CardBack /> : <div className="pile-empty" />}
        </div>
        <span className="pile-count">{view.deckCount}</span>
      </div>

      <div className="stage" ref={anchors.ref(zoneKey({ zone: 'limbo' }))}>
        {base !== undefined ? (
          <div className="stage-cards">
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
            {neighBanner && <span className="stage-banner">{neighBanner}</span>}
          </div>
        ) : (
          <div className="stage-empty" aria-hidden="true">{drop && <span className="drop-hint">{drop === 'over' ? 'Let go to play' : 'Drop here to play'}</span>}</div>
        )}
        {stageStamps.map((s) => <span key={s.id} className="stamp">{s.text}</span>)}
      </div>

      <div className="pile discard" aria-label={`Discard pile: ${view.discard.length} cards`}>
        <div className="pile-stack" ref={anchors.ref(zoneKey({ zone: 'discard' }))}>
          {discardTop !== null
            ? <CardTile data={data(discardTop)} onClick={() => onOpenCard(discardTop)} anchorRef={anchors.ref(cardKey(discardTop))} hidden={hidden.has(discardTop)} fx={fx.get(cardKey(discardTop))} className="tile-lg" />
            : <div className="pile-empty" />}
        </div>
        <span className="pile-count">{view.discard.length}</span>
      </div>

      <div className="pile nursery" aria-label={`Nursery: ${view.nursery.length} baby unicorns`}>
        <div className="pile-stack" ref={anchors.ref(zoneKey({ zone: 'nursery' }))}>
          {nurseryTop !== null
            ? <CardTile data={data(nurseryTop)} onClick={() => onOpenCard(nurseryTop)} anchorRef={anchors.ref(cardKey(nurseryTop))} hidden={hidden.has(nurseryTop)} className="tile-lg" />
            : <div className="pile-empty" />}
        </div>
        <span className="pile-count">{view.nursery.length}</span>
      </div>
    </section>
  );
}
