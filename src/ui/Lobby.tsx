import { useEffect, useState } from 'react';
import type { GameClient, Snapshot } from './net/client';
import { Wordmark } from './Wordmark';

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k) ?? '';
    } catch {
      return '';
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

export function Lobby({ client, snap, onBack }: { client: GameClient; snap: Snapshot; onBack(): void }) {
  const [name, setName] = useState(() => ls.get('uu.name'));
  const [pass, setPass] = useState(() => ls.get('uu.passphrase'));
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('join') ?? '');
  const [tab, setTab] = useState<'join' | 'create'>(code ? 'join' : 'create');
  useEffect(() => {
    ls.set('uu.name', name);
  }, [name]);
  useEffect(() => {
    ls.set('uu.passphrase', pass);
  }, [pass]);

  if (!snap.joined || !snap.lobby) {
    const busy = snap.status !== 'open';
    return (
      <main className="setup lobby">
        <header className="setup-head">
          <button type="button" className="ghost small" onClick={onBack}>Back</button>
          <Wordmark size="md" />
          <h2 className="display screen-title">Play online</h2>
          <p className="hint">{snap.status === 'open' ? 'Connected.' : snap.status === 'connecting' ? 'Connecting…' : 'Offline. Retrying…'}</p>
        </header>
        <label className="field">Your name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoComplete="nickname" data-testid="name" />
        </label>
        <div className="toggle" role="group" aria-label="Create or join">
          <button type="button" className={tab === 'create' ? 'on' : ''} onClick={() => setTab('create')}>Create a room</button>
          <button type="button" className={tab === 'join' ? 'on' : ''} onClick={() => setTab('join')}>Join a room</button>
        </div>
        {tab === 'create' ? (
          <form onSubmit={(e) => { e.preventDefault(); client.create(name, pass); }}>
            <label className="field">Family passphrase
              <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} data-testid="passphrase" />
            </label>
            <button type="submit" className="primary big" disabled={busy} data-testid="create">Create room</button>
          </form>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); client.join(code, name); }}>
            <label className="field">Room code
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={4} autoCapitalize="characters" data-testid="code" />
            </label>
            <button type="submit" className="primary big" disabled={busy || code.length !== 4} data-testid="join">Join</button>
          </form>
        )}
        {snap.error && <p className="error" role="alert" onClick={() => client.clearError()}>{snap.error}</p>}
        {snap.closedReason && <p className="hint">The room closed ({snap.closedReason}).</p>}
      </main>
    );
  }

  const { lobby } = snap;
  const isHost = lobby.host === lobby.you;
  const url = `${location.origin}${location.pathname}?join=${lobby.code}`;
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Unstable Unicorns', url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* cancelled */
    }
  };
  return (
    <main className="setup lobby">
      <header className="setup-head">
        <Wordmark size="sm" />
        <h2 className="display screen-title">Room <span className="code" data-testid="roomcode">{lobby.code}</span></h2>
        <p className="hint">{lobby.status === 'finished' ? 'Game over. ' : ''}{isHost ? 'You are the host. Start when everyone is in.' : `Waiting for ${lobby.seats[lobby.host]?.name ?? 'the host'} to start.`}</p>
        <button type="button" className="ghost small" onClick={share}>Share invite link</button>
      </header>
      <section className="seats" aria-label="Players">
        {lobby.seats.map((s, i) => (
          <div className={`seat ${s.connected || s.kind === 'bot' ? '' : 'offline'}`} key={i}>
            <span className="seat-no">{i + 1}</span>
            <span className="seat-name">{s.name}{i === lobby.you ? ' (you)' : ''}{s.kind === 'bot' ? ' · bot' : s.connected ? '' : ' · offline'}{i === lobby.host ? ' · host' : ''}</span>
            {isHost && i !== lobby.you && lobby.status === 'lobby' && <button type="button" className="ghost" onClick={() => client.send({ type: 'removeSeat', seat: i })} aria-label={`Remove ${s.name}`}>×</button>}
            {isHost && i !== lobby.you && s.kind === 'human' && <button type="button" className="ghost small" onClick={() => client.send({ type: 'makeHost', seat: i })}>Make host</button>}
          </div>
        ))}
        {isHost && lobby.status === 'lobby' && <button type="button" className="ghost add" onClick={() => client.send({ type: 'addBot' })} disabled={lobby.seats.length >= 8}>+ Add a bot</button>}
      </section>
      <section className="setup-foot">
        {isHost && lobby.status === 'lobby' && <button type="button" className="primary big go" onClick={() => client.send({ type: 'start' })} disabled={lobby.seats.length < 2} data-testid="start">Start game</button>}
        {isHost && lobby.status === 'finished' && <button type="button" className="primary big" onClick={() => client.send({ type: 'playAgain' })} data-testid="playagain">Play again</button>}
        {lobby.status === 'lobby' && <button type="button" className="ghost" onClick={() => { client.leave(); onBack(); }}>Leave room</button>}
        {lobby.status !== 'lobby' && <button type="button" className="ghost" onClick={() => { client.forget(); onBack(); }} data-testid="forget">Leave this game</button>}
        {snap.error && <p className="error" role="alert" onClick={() => client.clearError()}>{snap.error}</p>}
      </section>
    </main>
  );
}
