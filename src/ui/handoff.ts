// Pass-and-play: who should hold the device next? Derived from the live state on every render, so a bot's
// move in the meantime (which can reopen a Neigh window for someone else) never leaves a stale prompt.
import type { PlayerId } from '../engine/types';

/**
 * The human the device should be passed to, or null when the current viewer can carry on.
 * - the viewer stays if they are among the players who may act (several may, in a Neigh window);
 * - while a bot may act, nobody is asked to pass (the bot's move may change who is waited on);
 * - a single human never hands off.
 */
export function handoffTarget(actors: PlayerId[], isHuman: (p: PlayerId) => boolean, viewer: PlayerId, humans: number): PlayerId | null {
  if (humans < 2) return null;
  const humanActors = actors.filter(isHuman);
  if (humanActors.length === 0 || humanActors.includes(viewer)) return null;
  if (actors.some((p) => !isHuman(p))) return null;
  return humanActors[0]!;
}
