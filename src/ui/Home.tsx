export function Home({ onLocal, onOnline, onForget, hasSession }: { onLocal(): void; onOnline(): void; onForget(): void; hasSession: boolean }) {
  return (
    <main className="setup home">
      <header className="setup-head">
        <h1>Unstable Unicorns</h1>
        <p className="lede">Base set, 2nd Edition. Play with the family on your own devices, or pass one device around.</p>
      </header>
      <div className="choices big-choices">
        <button type="button" className="choice primary" onClick={onOnline}>{hasSession ? 'Back to my game' : 'Play online'}</button>
        {hasSession && <button type="button" className="ghost" onClick={onForget} data-testid="forget">Leave this game</button>}
        <button type="button" className="choice" onClick={onLocal}>Play on this device</button>
      </div>
    </main>
  );
}
