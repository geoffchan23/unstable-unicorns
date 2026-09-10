// Card renderings for the table: a full face, a back, and a small card-shaped tile (art + type strip).
import type { CardData } from '../../engine/types';
import { artFor } from '../art';
import { CardView } from '../Card';

export function CardFace({ data }: { data: CardData }) {
  return <CardView data={data} />;
}

export function CardBack({ className = '' }: { className?: string }) {
  const art = artFor('_back');
  return (
    <div className={`card-back ${className}`} aria-hidden="true">
      {art ? <img src={art} alt="" draggable={false} /> : <span className="card-back-mark">UU</span>}
    </div>
  );
}

/** A small "name + picture" card: the name on top, the square art below, the type colour underlining it. */
export function CardTile({ data, onClick, anchorRef, hidden, fx, className = '', testId }: {
  data: CardData; onClick?: () => void; anchorRef?: (el: HTMLElement | null) => void;
  hidden?: boolean; fx?: 'shake' | 'shield' | undefined; className?: string; testId?: string;
}) {
  const art = artFor(data.id);
  const cls = ['tile', `t-${data.type}`, fx ? `fx-${fx}` : '', className].filter(Boolean).join(' ');
  const style = hidden ? { visibility: 'hidden' as const } : undefined;
  const inner = (
    <>
      <span className="tile-name">{data.name}</span>
      {art ? <img className="tile-art" src={art} alt="" draggable={false} /> : <span className="tile-art tile-ph" aria-hidden="true">{data.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>}
    </>
  );
  if (onClick) {
    return <button type="button" className={cls} style={style} onClick={onClick} aria-label={data.name} title={data.name} ref={anchorRef as never} data-testid={testId}>{inner}</button>;
  }
  return <div className={cls} style={style} title={data.name} ref={anchorRef as never} data-testid={testId}>{inner}</div>;
}
