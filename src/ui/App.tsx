import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../engine/cards';
import { createGame, applyAction, legalActions, previewState, IllegalAction } from '../engine/game';
import { viewFor } from '../engine/view';
import { playersToAct, greedyBotAction } from '../engine/bot';
import { cardData } from '../engine/registry';
import { unicornCount, typeOf } from '../engine/queries';
import type { Action, Answer, GameState, InstanceId, PlayerId, Prompt } from '../engine/types';
import { CardView, TYPE_LABEL } from './Card';

type Seat = { name: string; kind: 'human' | 'bot' };

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BOT_NAMES = ['Sprinkles', 'Glitterhoof', 'Stabbington', 'Nimbus', 'Marshmallow', 'Twinkle', 'Rhubarb'];

// ------------------------------------------------------------------ setup

function Setup({ onStart }: { onStart: (seats: Seat[], seed: number) => void }) {
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
        <button type="button" className="primary big" onClick={() => onStart(seats, seed ? Number(seed) : Math.floor(Math.random() * 1e9))} disabled={humans === 0 && false}>
          Deal me in
        </button>
      </section>
    </main>
  );
}

// ------------------------------------------------------------------ game

interface GameProps { seats: Seat[]; seed: number; onQuit: () => void }

function Game({ seats, seed, onQuit }: GameProps) {
  const [state, setState] = useState<GameState>(() => createGame({ players: seats.map((s) => s.name), seed }));
  const rand = useMemo(() => mulberry(seed ^ 0x51ed), [seed]);
  const isHuman = useCallback((p: PlayerId) => seats[p]!.kind === 'human', [seats]);
  const humans = useMemo(() => seats.map((s, i) => (s.kind === 'human' ? i : -1)).filter((i) => i >= 0), [seats]);

  const actors = playersToAct(state);
  const botActor = actors.find((p) => !isHuman(p));
  const humanActor = actors.find((p) => isHuman(p));

  // whose eyes we look through
  const [viewer, setViewer] = useState<PlayerId>(humans[0] ?? 0);
  const [handoffTo, setHandoffTo] = useState<PlayerId | null>(null);
  useEffect(() => {
    if (humanActor !== undefined && humanActor !== viewer && humans.length > 1) setHandoffTo(humanActor);
  }, [humanActor, viewer, humans.length]);

  const [error, setError] = useState<string | null>(null);
  const dispatch = useCallback((a: Action) => {
    setState((s) => {
      try {
        return applyAction(s, a);
      } catch (e) {
        if (e instanceof IllegalAction) { setError(e.message); return s; }
        throw e;
      }
    });
  }, []);

  // bots think in the background
  const [botDelay] = useState(650);
  useEffect(() => {
    if (state.winner !== null || botActor === undefined) return;
    if (humanActor !== undefined && state.pending?.kind === 'neighWindow' && actors.indexOf(humanActor) < actors.indexOf(botActor)) {
      // let bots go first anyway: less waiting for the human
    }
    const id = setTimeout(() => {
      const a = greedyBotAction(state, botActor, rand);
      if (a) dispatch(a);
    }, botDelay);
    return () => clearTimeout(id);
  }, [state, botActor, humanActor, actors, rand, dispatch, botDelay]);

  const view = viewFor(state, viewer);
  const disp = previewState(state);
  const me = view.players[viewer]!;
  const myTurn = state.turn.player === viewer && state.turn.phase === 'action' && !state.pending && state.winner === null;
  const legal = useMemo(() => legalActions(state, viewer), [state, viewer]);
  const playable = new Set(legal.filter((a) => a.type === 'play').map((a) => (a as { card: InstanceId }).card));
  const canDraw = legal.some((a) => a.type === 'draw');

  const [targeting, setTargeting] = useState<InstanceId | null>(null);
  const [expanded, setExpanded] = useState<PlayerId | null>(null);

  const data = (id: InstanceId) => cardData.get(disp.cards[id]!.def)!;
  const name = (p: PlayerId) => state.players[p]!.name;

  const onHandCard = (id: InstanceId) => {
    if (!myTurn || !playable.has(id)) return;
    const t = typeOf(state, id);
    if (t === 'upgrade' || t === 'downgrade') setTargeting(id);
    else dispatch({ type: 'play', player: viewer, card: id });
  };

  const prompt = state.pending?.kind === 'prompt' && state.pending.prompt.player === viewer ? state.pending.prompt : null;
  const neighWindow = state.pending?.kind === 'neighWindow' && state.pending.awaiting.includes(viewer) ? state.pending : null;
  const stackTop = state.stack.length ? state.stack[0]! : null;

  const recent = state.log.slice(-40);
  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e9 }); }, [state.log.length]);

  return (
    <div className="game">
      <header className="topbar">
        <div className="turn">
          <span className="who">{state.winner !== null ? `${name(state.winner)} wins!` : `${name(state.turn.player)}'s turn`}</span>
          <span className="meta">Turn {state.turn.number} · deck {view.deckCount} · nursery {state.nursery.length} · first to {state.unicornsToWin}</span>
        </div>
        <button type="button" className="ghost small" onClick={onQuit}>Quit</button>
      </header>

      <section className="opponents" aria-label="Other players">
        {view.players.filter((p) => p.id !== viewer).map((p) => {
          const n = unicornCount(disp, p.id);
          const active = state.turn.player === p.id;
          return (
            <button type="button" key={p.id} className={`opp ${active ? 'active' : ''} ${expanded === p.id ? 'open' : ''}`} onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
              <span className="opp-name">{p.name}{seats[p.id]!.kind === 'bot' ? ' ·bot' : ''}</span>
              <span className="opp-count"><b>{n}</b><small>/{state.unicornsToWin}</small></span>
              <span className="opp-hand">{p.handCount} in hand</span>
              <span className="chips">
                {p.stable.map((c) => <CardView key={c} data={data(c)} compact />)}
              </span>
            </button>
          );
        })}
      </section>

      {expanded !== null && (
        <section className="expanded">
          <h3>{name(expanded)}'s stable</h3>
          <div className="row">{view.players[expanded]!.stable.map((c) => <CardView key={c} data={data(c)} />)}</div>
          {view.players[expanded]!.hand && (
            <><h3>{name(expanded)}'s hand (Nanny Cam)</h3><div className="row">{view.players[expanded]!.hand!.map((c) => <CardView key={c} data={data(c)} />)}</div></>
          )}
        </section>
      )}

      <section className="table">
        {stackTop && state.pending?.kind === 'neighWindow' && (
          <div className="playing">
            <span>{name(stackTop.player)} plays</span>
            <CardView data={data(stackTop.card)} compact />
            {state.stack.length > 1 && <span className="chain">{state.stack.length - 1} Neigh{state.stack.length > 2 ? 's' : ''} on it</span>}
            <span className="waiting">waiting on {state.pending.awaiting.map(name).join(', ')}</span>
          </div>
        )}
        <ol className="log" ref={logRef}>
          {recent.map((l, i) => <li key={state.log.length - recent.length + i} className={l.text.startsWith('---') ? 'turnmark' : ''}>{l.text.replace(/^--- | ---$/g, '')}</li>)}
        </ol>
      </section>

      <section className="mine">
        <div className="mine-head">
          <span className="you">{me.name}{humans.length > 1 ? '' : ' (you)'}</span>
          <span className="count"><b>{unicornCount(disp, viewer)}</b> / {state.unicornsToWin} unicorns</span>
        </div>
        <div className="stable row">
          {me.stable.length === 0 && <span className="empty">Your stable is empty.</span>}
          {me.stable.map((c) => <CardView key={c} data={data(c)} compact />)}
        </div>
        <div className="hand-head">
          <span>Hand · {me.hand?.length ?? 0}</span>
          {myTurn && <span className="cue">{state.turn.playsRemaining > 1 ? `Play a card (${state.turn.playsRemaining} left)` : 'Play a card, or draw instead'}</span>}
          {myTurn && canDraw && <button type="button" className="primary small" onClick={() => dispatch({ type: 'draw', player: viewer })}>Draw instead</button>}
        </div>
        <div className="hand row">
          {(me.hand ?? []).map((c) => (
            <CardView key={c} data={data(c)} onClick={() => onHandCard(c)} disabled={!myTurn || !playable.has(c)} />
          ))}
        </div>
      </section>

      {/* ---------- sheets ---------- */}
      {targeting !== null && (
        <Sheet title={`Play ${data(targeting).name} into whose stable?`} onClose={() => setTargeting(null)}>
          <div className="choices">
            {state.players.map((p) => (
              <button type="button" key={p.id} className="choice" onClick={() => { dispatch({ type: 'play', player: viewer, card: targeting, targetPlayer: p.id }); setTargeting(null); }}>
                {p.id === viewer ? `${p.name} (me)` : p.name}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {neighWindow && stackTop && (
        <Sheet title={`${name(state.stack[state.stack.length - 1]!.player)} ${state.stack.length > 1 ? 'Neighs' : 'plays'} ${data(state.stack[state.stack.length - 1]!.card).name}`}>
          <p className="sheet-sub">{state.stack.length > 1 ? `Neigh the Neigh and ${data(stackTop.card).name} ${state.stack.length % 2 === 0 ? 'resolves' : 'is cancelled'}.` : `Neigh it and it goes straight to the discard pile.`}</p>
          <div className="row center"><CardView data={data(state.stack[state.stack.length - 1]!.card)} /></div>
          <div className="choices">
            {legal.filter((a) => a.type === 'neigh').map((a) => (
              <button type="button" key={(a as { card: number }).card} className="choice neigh" onClick={() => dispatch(a)}>
                {data((a as { card: number }).card).name}!
              </button>
            ))}
            <button type="button" className="choice" onClick={() => dispatch({ type: 'pass', player: viewer })}>Let it happen</button>
          </div>
        </Sheet>
      )}

      {prompt && <PromptSheet prompt={prompt} state={disp} viewer={viewer} onAnswer={(answer) => dispatch({ type: 'respond', player: viewer, promptId: prompt.id, answer })} />}

      {handoffTo !== null && (
        <div className="overlay">
          <div className="overlay-box">
            <h2>Pass the device to {name(handoffTo)}</h2>
            <p>{name(handoffTo)} has a decision to make. Tap when only they can see the screen.</p>
            <button type="button" className="primary big" onClick={() => { setViewer(handoffTo); setHandoffTo(null); }}>I'm {name(handoffTo)}</button>
          </div>
        </div>
      )}

      {state.winner !== null && (
        <div className="overlay">
          <div className="overlay-box">
            <h2>{name(state.winner)} wins!</h2>
            <p>{unicornCount(state, state.winner)} unicorns in the stable after {state.turn.number} turns.</p>
            <button type="button" className="primary big" onClick={onQuit}>New game</button>
          </div>
        </div>
      )}

      {error && <div className="toast" role="alert" onClick={() => setError(null)}>{error}</div>}
    </div>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet">
        <div className="sheet-head">
          <h2>{title}</h2>
          {onClose && <button type="button" className="ghost small" onClick={onClose}>Cancel</button>}
        </div>
        {children}
      </div>
    </div>
  );
}

function PromptSheet({ prompt, state, viewer, onAnswer }: { prompt: Prompt; state: GameState; viewer: PlayerId; onAnswer: (a: Answer) => void }) {
  const [picked, setPicked] = useState<number[]>([]);
  useEffect(() => setPicked([]), [prompt.id]);
  const source = prompt.source !== undefined ? cardData.get(state.cards[prompt.source]!.def)?.name : undefined;
  const title = prompt.message;
  const data = (id: number) => cardData.get(state.cards[id]!.def)!;
  const ownerOf = (id: number) => state.players.find((p) => p.stable.includes(id) || p.hand.includes(id));

  let body: React.ReactNode;
  switch (prompt.kind) {
    case 'confirm':
      body = (
        <div className="choices">
          <button type="button" className="choice primary" onClick={() => onAnswer(true)}>Yes</button>
          <button type="button" className="choice" onClick={() => onAnswer(false)}>No</button>
        </div>
      );
      break;
    case 'choosePlayer':
      body = (
        <div className="choices">
          {(prompt.options as number[]).map((p) => (
            <button type="button" key={p} className="choice" onClick={() => onAnswer(p)}>
              {state.players[p]!.name}{p === viewer ? ' (me)' : ''} · {unicornCount(state, p)} unicorns
            </button>
          ))}
          {prompt.optional && <button type="button" className="choice ghost" onClick={() => onAnswer(null)}>Skip</button>}
        </div>
      );
      break;
    case 'chooseOption':
      body = (
        <div className="choices">
          {(prompt.options as string[]).map((o) => <button type="button" key={o} className="choice" onClick={() => onAnswer(o)}>{o}</button>)}
        </div>
      );
      break;
    case 'chooseCard': {
      const multi = (prompt.count ?? 1) > 1;
      body = (
        <>
          <div className="row wrap">
            {(prompt.options as number[]).map((id) => {
              const owner = ownerOf(id);
              const where = owner ? (owner.stable.includes(id) ? `${owner.id === viewer ? 'my' : owner.name + "'s"} stable` : `${owner.id === viewer ? 'my' : owner.name + "'s"} hand`) : state.discard.includes(id) ? 'discard' : state.deck.includes(id) ? 'deck' : '';
              return (
                <CardView
                  key={id} data={data(id)} badge={where || undefined} selected={picked.includes(id)}
                  onClick={() => {
                    if (!multi) onAnswer(id);
                    else setPicked((ps) => (ps.includes(id) ? ps.filter((x) => x !== id) : [...ps, id]));
                  }}
                />
              );
            })}
          </div>
          <div className="choices">
            {multi && <button type="button" className="choice primary" disabled={picked.length !== prompt.count} onClick={() => onAnswer(picked)}>Confirm {picked.length}/{prompt.count}</button>}
            {prompt.optional && <button type="button" className="choice ghost" onClick={() => onAnswer(null)}>Skip</button>}
          </div>
        </>
      );
      break;
    }
    default:
      body = <button type="button" className="choice" onClick={() => onAnswer(prompt.options as number[])}>Continue</button>;
  }
  return (
    <Sheet title={title}>
      {source && <p className="sheet-sub">{source}</p>}
      {body}
    </Sheet>
  );
}

// ------------------------------------------------------------------ app

export function App() {
  const [game, setGame] = useState<{ seats: Seat[]; seed: number } | null>(null);
  if (!game) return <Setup onStart={(seats, seed) => setGame({ seats, seed })} />;
  return <Game key={game.seed} seats={game.seats} seed={game.seed} onQuit={() => setGame(null)} />;
}

export { TYPE_LABEL };
