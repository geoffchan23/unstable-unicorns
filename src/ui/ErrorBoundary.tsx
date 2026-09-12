import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearLocalGame } from './localSave';

/**
 * The last resort. A React render error unmounts the whole tree, which without this leaves a blank
 * white page — the worst possible thing to hand a kid mid-game. Instead: say so, and offer the two
 * ways out. Reloading is the one to try first, because the local game is saved after every action
 * and comes straight back; starting over is there for when the saved game is what is broken.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // there is no error reporting service; the console is where a bug report gets copied from
    console.error('Unstable Unicorns crashed:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="setup crashed" data-testid="crashed">
        <div className="setup-head">
          <h1 className="screen-title">That broke.</h1>
          <p className="fine">Something went wrong and the game had to stop. Reloading usually picks the
            game back up where it was.</p>
        </div>
        <div className="choices big-choices">
          <button type="button" className="choice primary" onClick={() => location.reload()}>Reload</button>
          <button type="button" className="ghost" data-testid="crashed-restart"
            onClick={() => { clearLocalGame(); location.href = location.pathname; }}>
            Start a new game
          </button>
        </div>
        <pre className="crash-detail">{error.message}</pre>
      </main>
    );
  }
}
