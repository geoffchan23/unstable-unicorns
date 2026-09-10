// A card in flight between two anchors. Rendered in a portal at the destination's size; the outer
// element travels (translate + scale, with a small arc), the inner one flips when the face changes.
import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { CardData, MoveHow } from '../../engine/types';
import type { Rect } from './anchors';
import { CardFace, CardBack } from '../table/CardFace';

export interface FlyerSpec {
  id: number;
  data: CardData | null;      // null: a card the viewer may not see (always a back)
  from: Rect;
  to: Rect;
  faceFrom: boolean;
  faceTo: boolean;
  how: MoveHow;
  ms: number;
}

export function Flyer({ spec }: { spec: FlyerSpec }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const o = outer.current; const i = inner.current;
    if (!o || !i) return;
    const { from, to, ms } = spec;
    const dx = from.x + from.w / 2 - (to.x + to.w / 2);
    const dy = from.y + from.h / 2 - (to.y + to.h / 2);
    const s0 = Math.max(0.05, from.w / to.w);
    const lift = spec.how === 'draw' || spec.how === 'play' || spec.how === 'steal' ? -Math.min(120, Math.hypot(dx, dy) * 0.25) : -20;
    const spin = spec.how === 'countered' || spec.how === 'destroy' || spec.how === 'sacrifice' ? (dx > 0 ? -1 : 1) * 24 : 0;
    const ease = 'cubic-bezier(.22,.8,.3,1)';
    o.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${s0}) rotate(0deg)`, opacity: spec.how === 'countered' ? 1 : 1 },
      { transform: `translate(${dx / 2}px, ${dy / 2 + lift}px) scale(${(s0 + 1) / 2 * 1.08}) rotate(${spin / 2}deg)`, offset: 0.5 },
      { transform: `translate(0, 0) scale(1) rotate(${spin}deg)`, opacity: spec.how === 'countered' ? 0.55 : 1 },
    ], { duration: ms, easing: ease, fill: 'both' });
    if (spec.faceFrom !== spec.faceTo) {
      i.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], { duration: ms, easing: ease, fill: 'both' });
    }
  }, [spec]);

  const front = spec.faceFrom && spec.data ? <CardFace data={spec.data} /> : <CardBack />;
  const back = spec.faceTo && spec.data ? <CardFace data={spec.data} /> : <CardBack />;
  const flips = spec.faceFrom !== spec.faceTo;
  return createPortal(
    <div ref={outer} className={`flyer how-${spec.how}`} style={{ left: spec.to.x, top: spec.to.y, width: spec.to.w, height: spec.to.h, '--z': spec.to.w / 168 } as React.CSSProperties} aria-hidden="true">
      <div ref={inner} className="flyer-inner">
        <div className="flyer-face">{front}</div>
        {flips && <div className="flyer-face flyer-back">{back}</div>}
      </div>
    </div>,
    document.body,
  );
}
