import { useState } from 'react';
import '../engine/cards';
import { Setup } from './Setup';
import { LocalGame } from './LocalGame';
import type { Seat } from './seats';

export function App() {
  const [game, setGame] = useState<{ seats: Seat[]; seed: number } | null>(null);
  if (!game) return <Setup onStart={(seats, seed) => setGame({ seats, seed })} />;
  return <LocalGame key={game.seed} seats={game.seats} seed={game.seed} onQuit={() => setGame(null)} />;
}
