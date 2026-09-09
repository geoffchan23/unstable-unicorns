// Wording for prompts: always say who did what to you, and what you have to do about it.
import type { Prompt } from '../engine/types';

export interface PromptNames {
  player(p: number): string;
  card(id: number): string;
  cardText(id: number): string;
}
export interface PromptText {
  title: string;
  /** why: the card's own text, or a short explanation */
  sub: string | null;
  /** what you must do now (shown when the title is about someone else's action) */
  instruction: string | null;
  /** the culprit's card, when this prompt was caused by another player */
  hitBy: { player: string; card: string } | null;
}

const possessive = (name: string) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function describePrompt(prompt: Prompt, n: PromptNames): PromptText {
  const src = prompt.source !== undefined ? n.card(prompt.source) : null;
  const text = prompt.source !== undefined ? n.cardText(prompt.source) : null;
  const instruction = cap(src ? prompt.message.replace(new RegExp(`^${escapeRe(src)}:\\s*`), '') : prompt.message);
  const byOther = prompt.actor !== undefined && prompt.actor !== prompt.player;

  if (byOther && src) {
    const actor = n.player(prompt.actor!);
    const title = prompt.cause === 'play' ? `${actor} played ${src} on you` : `${possessive(actor)} ${src} hits you`;
    return { title, sub: text, instruction, hitBy: { player: actor, card: src } };
  }
  if (src) {
    return { title: instruction, sub: text ? `${src}: ${text}` : src, instruction: null, hitBy: null };
  }
  const sub = /^Discard down to/i.test(prompt.message) ? 'Hand limit: you can only keep 7 cards at the end of your turn.' : null;
  return { title: instruction, sub, instruction: null, hitBy: null };
}
