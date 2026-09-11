// Speech bubbles for the other players, drawn in a layer above the table rather than inside their seat.
// The seat row scrolls sideways, so it has to clip whatever is taller than a seat: a bubble long enough
// to wrap used to be cut off and hidden behind the table panel below it.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlayerId } from '../../engine/types';
import type { Anchors } from '../stage/anchors';
import type { Bubble } from '../stage/useStage';

export function Bubbles({ bubbles, anchors, exclude }: { bubbles: Bubble[]; anchors: Anchors; exclude: PlayerId }) {
  const shown = bubbles.filter((b) => b.player !== exclude);
  // the seats slide and the row scrolls while a bubble is up, so follow the avatar for as long as it shows
  const [, follow] = useState(0);
  useEffect(() => {
    if (!shown.length) return;
    let raf = requestAnimationFrame(function step() {
      follow((n) => n + 1);
      raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [shown.length]);

  if (!shown.length || typeof document === 'undefined') return null;
  return createPortal(
    <div className="bubble-layer" aria-hidden="true">
      {shown.map((b) => {
        const at = anchors.rect(`avatar:${b.player}`);
        if (!at) return null;
        // keep it on screen when the speaker is near an edge (half of the bubble's widest, plus a margin)
        const x = Math.min(Math.max(at.x + at.w / 2, 122), window.innerWidth - 122);
        return <div key={b.id} className="bubble seat-bubble" style={{ left: x, top: at.y + at.h + 6 }}>{b.text}</div>;
      })}
    </div>,
    document.body,
  );
}
