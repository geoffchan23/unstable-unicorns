import type { PlayerView } from '../../engine/view';
import type { SeatInfo } from '../seats';
import { avatarFor } from '../avatars';
import type { Banner } from '../stage/useStage';
import { Avatar } from './Avatar';

export function TurnBanner({ banner, view, seats }: { banner: Banner | null; view: PlayerView; seats: SeatInfo[] }) {
  if (!banner) return null;
  const p = view.players[banner.player]!;
  const mine = banner.player === view.me;
  const seat = seats[banner.player] ?? { name: p.name, kind: 'human' as const, connected: true };
  return (
    <div className={`turn-banner ${mine ? 'mine' : ''}`} key={banner.id} aria-live="polite">
      <div className="turn-banner-box">
        <Avatar avatar={avatarFor(seat, banner.player)} size="lg" />
        <span className="turn-banner-text">{mine ? 'Your turn' : `${p.name}'s turn`}</span>
      </div>
    </div>
  );
}
