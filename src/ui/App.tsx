import { useEffect, useState } from 'react';
import '../engine/cards';
import { Home } from './Home';
import { Setup } from './Setup';
import { LocalGame } from './LocalGame';
import { Lobby } from './Lobby';
import { OnlineGame } from './OnlineGame';
import { useClient } from './net/useClient';
import type { Seat } from './seats';

type Mode = 'home' | 'local-setup' | 'local-game' | 'online';

export function App() {
  const { client, snap } = useClient();
  const [mode, setMode] = useState<Mode>(() => (client.session() || new URLSearchParams(location.search).get('join') ? 'online' : 'home'));
  const [game, setGame] = useState<{ seats: Seat[]; seed: number } | null>(null);
  useEffect(() => {
    if (mode === 'online') client.connect();
  }, [mode, client]);

  switch (mode) {
    case 'home':
      return <Home hasSession={!!client.session()} onLocal={() => setMode('local-setup')} onOnline={() => setMode('online')} />;
    case 'local-setup':
      return <Setup onBack={() => setMode('home')} onStart={(seats, seed) => { setGame({ seats, seed }); setMode('local-game'); }} />;
    case 'local-game':
      return <LocalGame key={game!.seed} seats={game!.seats} seed={game!.seed} onQuit={() => setMode('local-setup')} />;
    case 'online':
      // Rendering on `snap.joined && snap.state` (rather than gating on lobby status === 'playing')
      // keeps the win overlay (and its `renderWin`) up while a finished game's lobby message is
      // still status: 'finished'; the lobby message only clears `state` once it flips back to
      // status: 'lobby' (after playAgain), at which point Lobby takes over again.
      if (snap.joined && snap.state) return <OnlineGame client={client} snap={snap} onQuit={() => setMode('home')} />;
      return <Lobby client={client} snap={snap} onBack={() => setMode('home')} />;
  }
}
