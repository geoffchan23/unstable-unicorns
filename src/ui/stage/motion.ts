// Timings for the staged playback. Reduced motion (the OS setting, or ?motion=off for tests) collapses
// everything to zero so the table still sequences correctly but never waits.
import type { MoveHow } from '../../engine/types';

export function reducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (new URLSearchParams(window.location.search).get('motion') === 'off') return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
}

/** how long a card's flight takes, by why it moved */
export function flightMs(how: MoveHow): number {
  switch (how) {
    case 'draw': return 520;
    case 'play': return 560;
    case 'neigh': return 480;
    case 'resolve': return 480;
    case 'countered': return 620;
    case 'destroy': case 'sacrifice': return 560;
    case 'steal': return 640;
    case 'return': return 480;
    case 'discard': return 420;
    default: return 480;
  }
}

/** a pause before the flight (the card shakes when it is about to be destroyed) */
export function windupMs(how: MoveHow): number {
  return how === 'destroy' || how === 'sacrifice' ? 380 : 0;
}

/** a pause after landing (a played card is shown off on the stage; a Neigh gets its stamp) */
export function holdMs(how: MoveHow): number {
  switch (how) {
    case 'play': return 380;
    case 'neigh': return 520;
    case 'countered': return 120;
    default: return 60;
  }
}

export const TURN_BANNER_MS = 950;
export const BUBBLE_MS = 2800;
export const SHUFFLE_MS = 520;
export const PROTECT_MS = 560;
export const SAY_GAP_MS = 90;

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
