// The local (pass-and-play / vs bots) game is saved after every action so an accidental reload or swipe
// brings it straight back. The engine is deterministic: seed + seats + actions rebuild the state.
import type { Action } from '../engine/types';
import type { Seat } from './seats';

export interface SavedLocalGame { seed: number; seats: Seat[]; actions: Action[] }

const KEY = 'uu.local';

export function loadLocalGame(): SavedLocalGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as SavedLocalGame;
    if (typeof g.seed !== 'number' || !Array.isArray(g.seats) || !Array.isArray(g.actions) || g.seats.length < 2) return null;
    return g;
  } catch { return null; }
}

export function saveLocalGame(g: SavedLocalGame): void {
  try { localStorage.setItem(KEY, JSON.stringify(g)); } catch { /* storage full or blocked */ }
}

export function clearLocalGame(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
