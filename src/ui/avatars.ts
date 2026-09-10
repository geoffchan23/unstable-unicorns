// Player avatars: an emoji on a coloured disc. Local seats pick one in Setup; online seats get one from
// their name, so the server protocol needs no change.
export const AVATARS = ['🦄', '🐴', '🌈', '🍭', '⚡', '🔥', '🧁', '👑', '🐱', '🦖', '🐼', '🍩', '🎩', '🌟', '🍉', '🐙', '🦊', '🐸', '🍕', '🚀'];
export const BOT_AVATARS = ['🦄', '🐴', '🌈', '🍭', '⚡', '🔥', '🧁', '👑'];

/** eight seat colours, matching the setup screen's numbered discs */
export const SEAT_HUES = ['#ee2b2b', '#f58022', '#e0ae00', '#6fb23a', '#16a5df', '#5b6cc9', '#8a4fbf', '#d64f9a'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export interface Avatar { emoji: string; color: string }

export function avatarFor(seat: { name: string; kind: 'human' | 'bot'; avatar?: string }, index: number): Avatar {
  const color = SEAT_HUES[index % SEAT_HUES.length]!;
  if (seat.avatar) return { emoji: seat.avatar, color };
  const pool = seat.kind === 'bot' ? BOT_AVATARS : AVATARS;
  return { emoji: pool[hash(seat.name || String(index)) % pool.length]!, color };
}

export function nextAvatar(current: string | undefined): string {
  const i = current ? AVATARS.indexOf(current) : -1;
  return AVATARS[(i + 1) % AVATARS.length]!;
}
