import type { GameClient, Snapshot } from './net/client';
import { GameScreen } from './GameScreen';

export function OnlineGame({ client, snap, onQuit }: { client: GameClient; snap: Snapshot; onQuit(): void }) {
  const st = snap.state!;
  const lobby = snap.lobby;
  const isHost = lobby ? lobby.host === lobby.you : false;
  const waitingOn = st.view.pending
    ? st.view.pending.kind === 'prompt'
      ? [st.view.pending.prompt.player]
      : st.view.pending.awaiting
    : st.view.turn.phase === 'action'
      ? [st.view.turn.player]
      : [];
  const offline = waitingOn.filter((p) => st.seats[p] && st.seats[p]!.kind === 'human' && !st.seats[p]!.connected);
  const banner = snap.status !== 'open' ? (
    <div className="banner warn">Reconnecting…</div>
  ) : offline.length ? (
    <div className="banner">
      Waiting on {offline.map((p) => st.view.players[p]!.name).join(', ')} (offline)
      {isHost && (
        <>
          {' '}·{' '}
          <button type="button" className="link" onClick={() => client.send({ type: 'replaceWithBot', seat: offline[0]! })}>replace with a bot</button>
        </>
      )}
    </div>
  ) : null;
  return (
    <GameScreen
      view={st.view}
      legal={st.legal}
      seats={st.seats}
      onAction={(a) => client.send({ type: 'action', action: a })}
      onQuit={onQuit}
      error={snap.error}
      onDismissError={() => client.clearError()}
      banner={banner}
      renderWin={() =>
        isHost ? (
          <button type="button" className="primary big" onClick={() => client.send({ type: 'playAgain' })} data-testid="playagain">Play again</button>
        ) : (
          <p>Waiting for the host to start another game.</p>
        )
      }
    />
  );
}
