import type { CardData, CardType } from '../engine/types';

export const TYPE_LABEL: Record<CardType, string> = {
  baby_unicorn: 'Baby Unicorn',
  basic_unicorn: 'Basic Unicorn',
  magical_unicorn: 'Magical Unicorn',
  magic: 'Magic',
  instant: 'Instant',
  upgrade: 'Upgrade',
  downgrade: 'Downgrade',
};

export function CardView({
  data, compact = false, selected = false, disabled = false, onClick, badge,
}: {
  data: CardData; compact?: boolean; selected?: boolean; disabled?: boolean; onClick?: () => void; badge?: string;
}) {
  const cls = ['card', `t-${data.type}`, compact ? 'compact' : '', selected ? 'selected' : '', disabled ? 'disabled' : '', onClick ? 'tappable' : ''].join(' ');
  const inner = (
    <>
      <span className="corner" aria-hidden="true" />
      <span className="name">{data.name}</span>
      {!compact && <span className="ctype">{TYPE_LABEL[data.type]}</span>}
      {!compact && data.type !== 'basic_unicorn' && <span className="text">{data.text}</span>}
      {badge && <span className="badge">{badge}</span>}
    </>
  );
  if (onClick) {
    return <button type="button" className={cls} onClick={onClick} disabled={disabled} aria-pressed={selected}>{inner}</button>;
  }
  return <div className={cls}>{inner}</div>;
}
