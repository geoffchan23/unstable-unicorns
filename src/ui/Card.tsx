import type { CardData, CardType } from '../engine/types';
import { artFor } from './art';

export const TYPE_LABEL: Record<CardType, string> = {
  baby_unicorn: 'Baby Unicorn',
  basic_unicorn: 'Basic Unicorn',
  magical_unicorn: 'Magical Unicorn',
  magic: 'Magic',
  instant: 'Instant',
  upgrade: 'Upgrade',
  downgrade: 'Downgrade',
};

/** The "Card Type:" line as printed on the physical cards. */
const TYPE_LINE: Record<CardType, string> = {
  baby_unicorn: 'Unicorn (Baby)',
  basic_unicorn: 'Unicorn (Basic)',
  magical_unicorn: 'Unicorn (Magical)',
  magic: 'Magic',
  instant: 'Instant',
  upgrade: 'Upgrade',
  downgrade: 'Downgrade',
};

/** Small white glyph for the coloured type badge in the card's corner. */
export function TypeGlyph({ type }: { type: CardType }) {
  switch (type) {
    case 'baby_unicorn':
    case 'basic_unicorn':
    case 'magical_unicorn':
      // striped horn
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2 L19 22 H5 Z" fill="currentColor" />
          <path d="M6.4 18 L17.6 16.2 M7.6 14.4 L16.4 13 M8.9 10.8 L15.1 9.8" stroke="var(--type)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'magic':
      // four-point sparkle
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2 C13 8 16 11 22 12 C16 13 13 16 12 22 C11 16 8 13 2 12 C8 11 11 8 12 2 Z" fill="currentColor" />
        </svg>
      );
    case 'instant':
      // speech bubble: the Neigh
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4 H20 A2 2 0 0 1 22 6 V15 A2 2 0 0 1 20 17 H11 L6 21 V17 H4 A2 2 0 0 1 2 15 V6 A2 2 0 0 1 4 4 Z" fill="currentColor" />
          <path d="M12 7 V12" stroke="var(--type)" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="12" cy="14.6" r="1.3" fill="var(--type)" />
        </svg>
      );
    case 'upgrade':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3 L21 12 H15.5 V21 H8.5 V12 H3 Z" fill="currentColor" />
        </svg>
      );
    case 'downgrade':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 21 L3 12 H8.5 V3 H15.5 V12 H21 Z" fill="currentColor" />
        </svg>
      );
  }
}

export function CardView({
  data, compact = false, selected = false, disabled = false, playable = false, dim = false, onClick, badge,
}: {
  data: CardData; compact?: boolean; selected?: boolean; disabled?: boolean;
  /** can be played right now (hand cards); adds the `playable` hook used by tests */
  playable?: boolean;
  /** visually muted but still tappable to read */
  dim?: boolean;
  onClick?: () => void; badge?: string;
}) {
  const art = artFor(data.id);
  const cls = ['card', `t-${data.type}`, compact ? 'compact' : '', selected ? 'selected' : '', disabled ? 'disabled' : '', playable ? 'playable' : '', dim ? 'unplayable' : '', onClick ? 'tappable' : ''].filter(Boolean).join(' ');
  const inner = compact ? (
    <>
      <span className="type-badge" aria-hidden="true"><TypeGlyph type={data.type} /></span>
      {art && <img className="thumb" src={art} alt="" draggable={false} />}
      <span className="name">{data.name}</span>
    </>
  ) : (
    <>
      <span className="card-head">
        <span className="type-badge" aria-hidden="true"><TypeGlyph type={data.type} /></span>
        <span className="name">{data.name}</span>
      </span>
      {art
        ? <img className="art" src={art} alt="" draggable={false} />
        : <span className="art placeholder" aria-hidden="true">{data.name.split(' ').map((w) => w[0]).join('').slice(0, 3)}</span>}
      <span className="card-body">
        <span className="ctype">Card Type: {TYPE_LINE[data.type]}</span>
        {data.type !== 'basic_unicorn' && <span className="text">{data.text}</span>}
      </span>
      {badge && <span className="badge">{badge}</span>}
    </>
  );
  if (onClick) {
    return <button type="button" className={cls} onClick={onClick} disabled={disabled} aria-pressed={selected} aria-label={data.name}>{inner}</button>;
  }
  return <div className={cls}>{inner}</div>;
}
