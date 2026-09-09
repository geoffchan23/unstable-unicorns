import { useState } from 'react';
import { Wordmark } from './Wordmark';
import { THEMES, currentTheme, setTheme, type Theme } from './theme';

export function Home({ onLocal, onOnline, onForget, hasSession }: { onLocal(): void; onOnline(): void; onForget(): void; hasSession: boolean }) {
  const [theme, setThemeState] = useState<Theme>(() => currentTheme());
  const pick = (t: Theme) => { setTheme(t); setThemeState(t); };
  return (
    <main className="setup home">
      <div className="toggle theme-toggle" role="group" aria-label="Theme">
        {THEMES.map((t) => (
          <button type="button" key={t.id} className={theme === t.id ? 'on' : ''} onClick={() => pick(t.id)} data-testid={`theme-${t.id}`}>{t.label}</button>
        ))}
      </div>
      <Wordmark size="lg" tagline />
      <div className="choices big-choices">
        <button type="button" className="choice primary" onClick={onOnline}>{hasSession ? 'Back to my game' : 'Play online'}</button>
        {hasSession && <button type="button" className="ghost" onClick={onForget} data-testid="forget">Leave this game</button>}
        <button type="button" className="choice" onClick={onLocal}>Play on this device</button>
      </div>
      <p className="fine">Base set, 2nd Edition. Play with the family on your own devices, or pass one device around. A fan project, not affiliated with Unstable Games.</p>
    </main>
  );
}
