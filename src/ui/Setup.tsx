import { useState } from 'react';
import type { Seat } from './seats';

export const BOT_NAMES = ['Sprinkles', 'Glitterhoof', 'Stabbington', 'Nimbus', 'Marshmallow', 'Twinkle', 'Rhubarb'];

export function Setup({ onStart, onBack }: { onStart: (seats: Seat[], seed: number) => void; onBack?: () => void }) {
  const [seats, setSeats] = useState<Seat[]>([
    { name: 'Player', kind: 'human' },
    { name: BOT_NAMES[0]!, kind: 'bot' },
    { name: BOT_NAMES[1]!, kind: 'bot' },
  ]);
  const [seed, setSeed] = useState<string>('');
  const humans = seats.filter((s) => s.kind === 'human').length;

  const update = (i: number, patch: Partial<Seat>) => setSeats((ss) => ss.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const add = () => setSeats((ss) => [...ss, { name: BOT_NAMES[ss.length - 1] ?? `Bot ${ss.length}`, kind: 'bot' }]);
  const remove = (i: number) => setSeats((ss) => ss.filter((_, j) => j !== i));

  return (
    <main className="setup">
      <header className="setup-head">
        <h1>Unstable Unicorns</h1>
        {onBack && <button type="button" className="ghost small" onClick={onBack}>Back</button>}
        <p className="lede">Base set, 2nd Edition. First to 7 Unicorns wins (6 with six or more players). Bots fill any seat you leave to them; more than one human means pass-and-play on this device.</p>
      </header>
      <section className="seats" aria-label="Players">
        {seats.map((s, i) => (
          <div className="seat" key={i}>
            <span className="seat-no">{i + 1}</span>
            <input value={s.name} onChange={(e) => update(i, { name: e.target.value })} aria-label={`Player ${i + 1} name`} />
            <div className="toggle" role="group" aria-label="Human or bot">
              <button type="button" className={s.kind === 'human' ? 'on' : ''} onClick={() => update(i, { kind: 'human' })}>Human</button>
              <button type="button" className={s.kind === 'bot' ? 'on' : ''} onClick={() => update(i, { kind: 'bot' })}>Bot</button>
            </div>
            <button type="button" className="ghost" onClick={() => remove(i)} disabled={seats.length <= 2} aria-label="Remove player">×</button>
          </div>
        ))}
        <button type="button" className="ghost add" onClick={add} disabled={seats.length >= 8}>+ Add a player</button>
      </section>
      <section className="setup-foot">
        <label className="seed">Seed <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="random" inputMode="numeric" /></label>
        <p className="hint">{seats.length === 2 ? 'Two players: the official 2-player deck is used (32 cards removed, one Neigh each to start).' : `${seats.length} players, ${humans} human.`}</p>
        <button type="button" className="primary big" onClick={() => onStart(seats, seed ? Number(seed) : Math.floor(Math.random() * 1e9))}>
          Deal me in
        </button>
      </section>
    </main>
  );
}
