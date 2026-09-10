import type { PlayerId } from '../../engine/types';
import type { PlayerView } from '../../engine/view';
import type { SeatInfo } from '../seats';
import { avatarFor, SEAT_HUES } from '../avatars';
import { Avatar } from './Avatar';

const PIECES = Array.from({ length: 36 }, (_, i) => i);

export function WinOverlay({ winner, view, seats, children }: { winner: PlayerId; view: PlayerView; seats: SeatInfo[]; children: React.ReactNode }) {
  const p = view.players[winner]!;
  const seat = seats[winner] ?? { name: p.name, kind: 'human' as const, connected: true };
  return (
    <div className="overlay win-overlay">
      <div className="confetti" aria-hidden="true">
        {PIECES.map((i) => (
          <i key={i} style={{ '--x': `${(i * 37) % 100}%`, '--d': `${(i % 7) * 0.18}s`, '--r': `${(i * 53) % 360}deg`, '--c': SEAT_HUES[i % SEAT_HUES.length] } as React.CSSProperties} />
        ))}
      </div>
      <div className="overlay-box" data-testid="win">
        <Avatar avatar={avatarFor(seat, winner)} size="lg" />
        <h2>{winner === view.me ? 'You win!' : `${p.name} wins!`}</h2>
        <p>{view.unicornCounts[winner]} unicorns in the stable after {view.turn.number} turns.</p>
        {children}
      </div>
    </div>
  );
}
