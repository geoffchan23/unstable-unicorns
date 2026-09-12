import { useEffect, useState } from 'react';
import '../engine/cards';
import { Home } from './Home';
import { Setup } from './Setup';
import { LocalGame } from './LocalGame';
import { Lobby } from './Lobby';
import { OnlineGame } from './OnlineGame';
import { useClient } from './net/useClient';
import { applyUpdate } from './pwa/register';
import type { Seat } from './seats';
import type { Action } from '../engine/types';
import { loadLocalGame } from './localSave';

type Mode = 'home' | 'local-setup' | 'local-game' | 'online';

export function App() {
  // a way to see the crash screen (and to test it) without breaking something for real; dev builds only
  if (__DEV__ && new URLSearchParams(location.search).has('crash')) throw new Error('?crash=1');
  const { client, snap } = useClient();
  // a saved local game (an accidental reload mid-game) resumes straight away
  const saved = useState(() => loadLocalGame())[0];
  const [mode, setMode] = useState<Mode>(() => (client.session() || new URLSearchParams(location.search).get('join') ? 'online' : saved ? 'local-game' : 'home'));
  const [game, setGame] = useState<{ seats: Seat[]; seed: number; resume?: Action[] } | null>(() => (saved ? { seats: saved.seats, seed: saved.seed, resume: saved.actions } : null));
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => {
    if (mode === 'online') client.connect();
  }, [mode, client]);
  useEffect(() => {
    const onUpdate = () => setUpdateReady(true);
    window.addEventListener('uu:update', onUpdate);
    return () => window.removeEventListener('uu:update', onUpdate);
  }, []);

  return (
    <>
      {renderMode()}
      {updateReady && (
        <div className="toast update" data-testid="update">
          Update available <button type="button" className="ghost small" onClick={applyUpdate}>Reload</button>
        </div>
      )}
    </>
  );

  function renderMode() {
    switch (mode) {
      case 'home':
        return <Home hasSession={!!client.session()} onLocal={() => setMode('local-setup')} onOnline={() => setMode('online')} onForget={() => client.forget()} />;
      case 'local-setup':
        return <Setup onBack={() => setMode('home')} onStart={(seats, seed) => { setGame({ seats, seed }); setMode('local-game'); }} />;
      case 'local-game':
        return <LocalGame key={game!.seed} seats={game!.seats} seed={game!.seed} resume={game!.resume} onQuit={() => setMode('local-setup')} />;
      case 'online':
        // Rendering on `snap.joined && snap.state` (rather than gating on lobby status === 'playing')
        // keeps the win overlay (and its `renderWin`) up while a finished game's lobby message is
        // still status: 'finished'; the lobby message only clears `state` once it flips back to
        // status: 'lobby' (after playAgain), at which point Lobby takes over again.
        if (snap.joined && snap.state) return <OnlineGame client={client} snap={snap} onQuit={() => setMode('home')} />;
        return <Lobby client={client} snap={snap} onBack={() => setMode('home')} />;
    }
  }
}
