// Wording for the Neigh window, derived from the real stack so it never lies about what is happening.
// stack[0] is the card that was played; every later item is a Neigh (or Super Neigh) answering the
// item beneath it. The top item is live; each live Neigh cancels the one below.

import type { InstanceId, PlayerId, StackItem } from '../engine/types';

export interface NeighNames {
  player(p: PlayerId): string;
  card(id: InstanceId): string;
  /** true for Magic cards, which choose their targets only when they resolve */
  isMagic?(id: InstanceId): boolean;
}

export interface NeighWindowText {
  /** headline: who just did what */
  title: string;
  /** what happens next, from the viewer's point of view */
  sub: string;
  /** the card to show large: the one that was just played (the top of the stack) */
  featured: InstanceId;
  /** the card everyone is fighting over */
  base: InstanceId;
  neighCount: number;
  /** true when the base card resolves if nobody responds now */
  standsIfPassed: boolean;
  /** one-line status for the table banner, e.g. "2 Neighs on it · it stands so far" */
  banner: string;
  /** label for the pass button: "Let it happen" when you could Neigh, plain "OK" when you can't */
  ok: string;
}

const possessive = (name: string) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

export function describeNeighWindow(stack: StackItem[], me: PlayerId, n: NeighNames, canNeigh = true): NeighWindowText {
  if (stack.length === 0) throw new Error('describeNeighWindow: empty stack');
  const base = stack[0]!;
  const top = stack[stack.length - 1]!;
  const neighCount = stack.length - 1;
  const standsIfPassed = neighCount % 2 === 0;
  const baseName = n.card(base.card);
  const mine = base.player === me;
  const whose = mine ? 'your' : possessive(n.player(base.player));

  const verb = canNeigh ? 'plays' : 'played';
  const onto = base.targetPlayer === undefined ? ''
    : base.targetPlayer === me ? ' on you'
    : base.targetPlayer === base.player ? ' on themselves'
    : ` on ${n.player(base.targetPlayer)}`;
  let title: string;
  if (neighCount === 0) {
    title = `${n.player(base.player)} ${verb} ${baseName}${onto}`;
  } else {
    const answered = stack[stack.length - 2]!;
    const target = stack.length - 2 === 0
      ? (mine ? `your ${baseName}` : baseName)
      : `${answered.player === me ? 'your' : possessive(n.player(answered.player))} ${n.card(answered.card)}`;
    title = `${n.player(top.player)} ${verb} ${n.card(top.card)} on ${target}`;
  }

  const outcomeNow = standsIfPassed
    ? `If nobody responds, ${whose} ${baseName} goes ahead.`
    : `If nobody responds, ${whose} ${baseName} is Neigh'd and goes to the discard pile.`;
  const outcomeIfNeigh = standsIfPassed
    ? `Neigh it and ${baseName} is cancelled instead.`
    : `Neigh back and ${baseName} goes ahead after all.`;
  const targetsLater = n.isMagic?.(base.card) && base.targetPlayer === undefined
    ? `${mine ? 'You' : n.player(base.player)} will pick who it hits only if it goes ahead: Magic cards choose their targets when they resolve. `
    : '';
  const sub = `${targetsLater}${canNeigh ? `${outcomeNow} ${outcomeIfNeigh}` : outcomeNow}`;

  const banner = neighCount === 0
    ? 'waiting for Neighs'
    : `${neighCount} Neigh${neighCount > 1 ? 's' : ''} on it · ${standsIfPassed ? 'it stands so far' : "it's Neigh'd so far"}`;

  return { title, sub, featured: top.card, base: base.card, neighCount, standsIfPassed, banner, ok: canNeigh ? 'Let it happen' : 'OK' };
}
