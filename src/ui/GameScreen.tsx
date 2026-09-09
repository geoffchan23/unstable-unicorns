import { useEffect, useMemo, useRef, useState } from 'react';
import { cardData } from '../engine/registry';
import type { Action, Answer, InstanceId, PlayerId, Prompt } from '../engine/types';
import type { PlayerView } from '../engine/view';
import { CardView, TYPE_LABEL, TypeGlyph } from './Card';
import { artFor } from './art';
import { describeNeighWindow } from './neighText';
import { groupTurns, tokenizeLine } from './turnLog';
import { describePrompt } from './promptText';
import type { CardData } from '../engine/types';
import { useWakeLock } from './pwa/wakeLock';
import type { SeatInfo } from './seats';

export interface GameScreenProps {
  view: PlayerView;
  legal: Action[];
  seats: SeatInfo[];
  onAction: (a: Action) => void;
  onQuit: () => void;
  error: string | null;
  onDismissError: () => void;
  youLabel?: string;             // default ' (you)'
  banner?: React.ReactNode;      // rendered under the top bar (reconnecting, offline player)
  renderWin?: (winner: PlayerId) => React.ReactNode;  // default: "New game" button -> onQuit
  children?: React.ReactNode;    // extra overlays (hot-seat handoff)
  /** the game's seed, shown so a bug report can name it */
  seed?: number;
  /** builds a JSON game report (seed, seats, every action) for bug reports */
  report?: () => string;
}

export function GameScreen({
  view, legal, seats, onAction, onQuit, error, onDismissError, youLabel, banner, renderWin, children, seed, report,
}: GameScreenProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const copyReport = async () => {
    if (!report) return;
    const text = report();
    try { await navigator.clipboard.writeText(text); setCopied('Game report copied. Paste it into a message to reproduce this game.'); }
    catch { setCopied(`Could not copy. Seed ${seed ?? '?'}.`); }
    setTimeout(() => setCopied(null), 4000);
  };
  useWakeLock(true);
  const me = view.players[view.me]!;
  const myTurn = view.turn.player === view.me && view.turn.phase === 'action' && !view.pending && view.winner === null;
  const playable = new Set(legal.filter((a) => a.type === 'play').map((a) => (a as { card: InstanceId }).card));
  const canDraw = legal.some((a) => a.type === 'draw');

  const [detail, setDetail] = useState<{ id: InstanceId | null; data: CardData } | null>(null);
  const [history, setHistory] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<PlayerId | null>(null);

  const data = (id: InstanceId) => cardData.get(view.cards[id]!.def)!;
  const openCard = (id: InstanceId) => setDetail({ id, data: data(id) });
  const openDef = (d: CardData) => setDetail({ id: null, data: d });
  const byName = useMemo(() => new Map([...cardData.values()].map((d) => [d.name, d] as const)), []);
  const allNames = useMemo(() => [...byName.keys()], [byName]);
  const turns = useMemo(() => groupTurns(view.log), [view.log]);

  const inHand = (id: InstanceId) => (me.hand ?? []).includes(id);
  const playDetail = (target?: PlayerId) => {
    if (!detail || detail.id === null) return;
    onAction({ type: 'play', player: view.me, card: detail.id, ...(target !== undefined ? { targetPlayer: target } : {}) });
    setDetail(null);
  };

  const prompt = view.pending?.kind === 'prompt' && view.pending.prompt.player === view.me ? view.pending.prompt : null;
  const neighWindow = view.pending?.kind === 'neighWindow' && view.pending.awaiting.includes(view.me) ? view.pending : null;
  const stackTop = view.stack.length ? view.stack[0]! : null;
  const canNeigh = legal.some((a) => a.type === 'neigh');
  const mandatoryBegin = view.pending?.kind === 'beginTurn' ? view.pending.mandatory : [];
  const neighText = view.stack.length && view.pending?.kind === 'neighWindow'
    ? describeNeighWindow(view.stack, view.me, { player: (p) => view.players[p]!.name, card: (id) => data(id).name }, canNeigh)
    : null;

  const recent = view.log.slice(-40);
  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e9 }); }, [view.log.length]);

  // notices: things that happened without a prompt ("no Magic cards in the discard pile") get a toast
  const [notice, setNotice] = useState<string | null>(null);
  const seenLog = useRef(view.log.length);
  useEffect(() => {
    const fresh = view.log.slice(seenLog.current).filter((l) => l.notice);
    seenLog.current = view.log.length;
    if (!fresh.length) return;
    setNotice(fresh[fresh.length - 1]!.text);
    const id = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(id);
  }, [view.log.length, view.log]);

  return (
    <div className="game">
      <header className="topbar" data-testid="topbar">
        <div className="turn">
          <span className="who">{view.winner !== null ? `${view.players[view.winner]!.name} wins!` : `${view.players[view.turn.player]!.name}'s turn`}</span>
          <span className="meta">Turn {view.turn.number} · deck {view.deckCount} · nursery {view.nursery.length} · first to {view.unicornsToWin}
            {seed !== undefined && <> · <button type="button" className="link seedlink" onClick={copyReport} title="Copy a report of this game for bug fixing" data-testid="report">seed {seed}</button></>}
          </span>
        </div>
        <button type="button" className="ghost small" onClick={onQuit}>Quit</button>
      </header>

      {banner}

      <section className="opponents" aria-label="Other players">
        {view.players.filter((p) => p.id !== view.me).map((p) => {
          const n = view.unicornCounts[p.id]!;
          const active = view.turn.player === p.id;
          const botTag = seats[p.id]?.kind === 'bot' ? ' ·bot' : '';
          const offlineTag = seats[p.id]?.connected === false ? ' ·offline' : '';
          return (
            <button type="button" key={p.id} className={`opp ${active ? 'active' : ''} ${expanded === p.id ? 'open' : ''}`} onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
              <span className="opp-name">{p.name}{botTag}{offlineTag}</span>
              <span className="opp-count"><b>{n}</b><small>/{view.unicornsToWin}</small></span>
              <span className="opp-hand">{p.handCount} in hand</span>
              <span className="chips">
                {p.stable.map((c) => <CardView key={c} data={data(c)} compact />)}
              </span>
            </button>
          );
        })}
      </section>

      {expanded !== null && expanded !== view.me && (
        <section className="expanded" data-testid="expanded">
          <div className="expanded-head">
            <h3>{view.players[expanded]!.name}'s stable</h3>
            <button type="button" className="sheet-x" onClick={() => setExpanded(null)} aria-label="Close stable" data-testid="expanded-close">×</button>
          </div>
          <div className="row">{view.players[expanded]!.stable.map((c) => <CardView key={c} data={data(c)} onClick={() => openCard(c)} />)}</div>
          {view.players[expanded]!.hand && (
            <><h3>{view.players[expanded]!.name}'s hand (Nanny Cam)</h3><div className="row">{view.players[expanded]!.hand!.map((c) => <CardView key={c} data={data(c)} onClick={() => openCard(c)} />)}</div></>
          )}
        </section>
      )}

      <section className="table">
        {stackTop && view.pending?.kind === 'neighWindow' && (
          <div className="playing">
            <span>{view.players[stackTop.player]!.name} plays</span>
            <CardView data={data(stackTop.card)} compact onClick={() => openCard(stackTop.card)} />
            {neighText && <span className="chain">{neighText.banner}</span>}
            <span className="waiting">waiting on {view.pending.awaiting.map((p) => view.players[p]!.name).join(', ')}</span>
          </div>
        )}
        <button type="button" className="table-head" onClick={() => setHistory(turns.length - 1)} data-testid="history-open">
          <span className="section-label">Turn log</span><span className="table-hint">Tap for the full story ▸</span>
        </button>
        <ol className="log" ref={logRef} onClick={() => setHistory(turns.length - 1)}>
          {recent.map((l, i) => <li key={view.log.length - recent.length + i} className={l.text.startsWith('---') ? 'turnmark' : l.notice ? 'notice' : ''}>{l.text.replace(/^--- | ---$/g, '')}</li>)}
        </ol>
      </section>

      <section className="mine">
        <div className={`stable-panel ${myTurn ? 'active' : ''} ${expanded === view.me ? 'open' : ''}`}>
          <button type="button" className="mine-head" onClick={() => setExpanded(expanded === view.me ? null : view.me)} aria-expanded={expanded === view.me} data-testid="stable-toggle">
            <span className="section-label">Your stable <span className="chev" aria-hidden="true">{expanded === view.me ? '▾' : '▸'}</span></span>
            <span className="you">{me.name}{youLabel ?? ' (you)'}</span>
            <span className="count"><b>{view.unicornCounts[view.me]}</b> / {view.unicornsToWin} unicorns</span>
          </button>
          {expanded === view.me ? (
            <div className="stable-full row">
              {me.stable.length === 0 && <span className="empty">Nothing here yet. Play Unicorns to fill it.</span>}
              {me.stable.map((c) => <CardView key={c} data={data(c)} onClick={() => openCard(c)} />)}
            </div>
          ) : (
            <div className="stable row">
              {me.stable.length === 0 && <span className="empty">Nothing here yet. Play Unicorns to fill it.</span>}
              {me.stable.map((c) => <CardView key={c} data={data(c)} compact onClick={() => openCard(c)} />)}
            </div>
          )}
        </div>
        <div className="hand-head">
          <span className="section-label">Your hand · {me.hand?.length ?? 0}</span>
          {myTurn && <span className="cue">{view.turn.playsRemaining > 1 ? `Play a card (${view.turn.playsRemaining} left)` : 'Play a card, or draw instead'}</span>}
          {myTurn && canDraw && <button type="button" className="primary small" data-testid="draw" onClick={() => onAction({ type: 'draw', player: view.me })}>Draw instead</button>}
        </div>
        <div className="hand row" data-testid="hand">
          {(me.hand ?? []).map((c) => (
            <CardView key={c} data={data(c)} onClick={() => openCard(c)} playable={myTurn && playable.has(c)} dim={!myTurn || !playable.has(c)} />
          ))}
        </div>
      </section>

      {/* ---------- sheets ---------- */}
      {history !== null && turns[history] && (
        <Sheet title={turns[history]!.player ? `${turns[history]!.player}'s turn` : 'Setup'} onClose={() => setHistory(null)} testId="history">
          <div className="history-nav">
            <button type="button" className="ghost small" disabled={history <= 0} onClick={() => setHistory(history - 1)}>◀ Earlier</button>
            <span className="history-pos">Turn {turns[history]!.turn}{turns[history]!.player ? '' : ' · before play'} · {history + 1} of {turns.length}</span>
            <button type="button" className="ghost small" disabled={history >= turns.length - 1} onClick={() => setHistory(history + 1)}>Later ▶</button>
          </div>
          <ol className="history-lines">
            {turns[history]!.lines.map((l, i) => (
              <li key={i} className={l.notice ? 'notice' : ''}>
                {tokenizeLine(l.text, allNames).map((part, j) => part.card
                  ? <button type="button" key={j} className={`cardref t-${byName.get(part.card)!.type}`} onClick={() => openDef(byName.get(part.card!)!)}>{part.text}</button>
                  : <span key={j}>{part.text}</span>)}
              </li>
            ))}
            {turns[history]!.lines.length === 0 && <li className="empty">Nothing happened yet this turn.</li>}
          </ol>
        </Sheet>
      )}


      {neighWindow && stackTop && neighText && (
        <Sheet title={neighText.title} testId="neigh">
          <p className="sheet-sub">{neighText.sub}</p>
          <div className="row center neigh-stage">
            <CardView data={data(neighText.base)} onClick={() => openCard(neighText.base)} />
            {neighText.neighCount > 0 && (
              <ol className="neigh-chain" aria-label="Neighs played">
                {view.stack.slice(1).map((item, i) => (
                  <li key={item.card} className={i === view.stack.length - 2 ? 'latest' : ''}>
                    <CardView data={data(item.card)} compact onClick={() => openCard(item.card)} />
                    <span className="chain-who">{view.players[item.player]!.name}{item.player === view.me ? ' (you)' : ''}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="choices">
            {legal.filter((a) => a.type === 'neigh').map((a) => (
              <button type="button" key={(a as { card: number }).card} className="choice neigh" onClick={() => onAction(a)}>
                {data((a as { card: number }).card).name}!
              </button>
            ))}
            <button type="button" className={`choice ${canNeigh ? '' : 'primary'}`} data-testid="pass" onClick={() => onAction({ type: 'pass', player: view.me })}>{neighText.ok}</button>
          </div>
        </Sheet>
      )}

      {prompt && <PromptSheet prompt={prompt} view={view} onAnswer={(answer) => onAction({ type: 'respond', player: view.me, promptId: prompt.id, answer })} />}

      {view.pending?.kind === 'beginTurn' && view.pending.player === view.me && (
        <Sheet title="Beginning of your turn" testId="begin">
          <p className="sheet-sub">
            Use your stable's beginning-of-turn cards in any order, then draw.
            {view.pending.mandatory.length > 0 && ' Cards marked "must resolve" happen either way.'}
          </p>
          <ol className="begin-list">
            {view.pending.options.map((c) => {
              const must = mandatoryBegin.includes(c);
              return (
                <li key={c}>
                  <CardView data={data(c)} compact onClick={() => openCard(c)} />
                  <span className="begin-text">{data(c).text}</span>
                  <span className="begin-actions">
                    {must && <span className="must">must resolve</span>}
                    <button type="button" className="primary small" data-testid="begin-use" onClick={() => onAction({ type: 'beginTurn', player: view.me, card: c })}>{must ? 'Resolve now' : 'Use it'}</button>
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="choices">
            <button type="button" className="choice primary" data-testid="begin-draw" onClick={() => onAction({ type: 'beginTurn', player: view.me, card: null })}>
              {view.pending.mandatory.length > 0 ? 'Resolve the rest and draw' : 'Skip these and draw a card'}
            </button>
          </div>
        </Sheet>
      )}

      {detail && (
        <CardDetailSheet
          data={detail.data}
          inHand={detail.id !== null && inHand(detail.id)}
          canPlay={detail.id !== null && inHand(detail.id) && myTurn && playable.has(detail.id)}
          blockedBy={detail.id !== null ? view.playBlocks[detail.id] ?? null : null}
          myTurn={myTurn}
          players={view.players.map((p) => ({ id: p.id, name: p.id === view.me ? `${p.name} (me)` : p.name }))}
          onPlay={playDetail}
          onClose={() => setDetail(null)}
        />
      )}

      {children}

      {view.winner !== null && (
        <div className="overlay">
          <div className="overlay-box" data-testid="win">
            <h2>{view.players[view.winner]!.name} wins!</h2>
            <p>{view.unicornCounts[view.winner]} unicorns in the stable after {view.turn.number} turns.</p>
            {renderWin ? renderWin(view.winner) : <button type="button" className="primary big" onClick={onQuit}>New game</button>}
          </div>
        </div>
      )}

      {error && <div className="toast" role="alert" onClick={onDismissError}>{error}</div>}
      {!error && copied && <div className="toast notice" role="status" onClick={() => setCopied(null)}>{copied}</div>}
      {!error && notice && <div className="toast notice" role="status" data-testid="notice" onClick={() => setNotice(null)}>{notice}</div>}
    </div>
  );
}

/** The opened-up card: big art, full text, and whatever you can do with it right now. */
function CardDetailSheet({ data, inHand, canPlay, myTurn, blockedBy, players, onPlay, onClose }: {
  data: CardData; inHand: boolean; canPlay: boolean; myTurn: boolean; blockedBy: string | null;
  players: { id: PlayerId; name: string }[]; onPlay: (target?: PlayerId) => void; onClose: () => void;
}) {
  const art = artFor(data.id);
  const needsTarget = data.type === 'upgrade' || data.type === 'downgrade';
  return (
    <Sheet title={data.name} onClose={onClose} testId="detail" className="above">
      <div className={`detail t-${data.type}`}>
        {art
          ? <img className="detail-art" src={art} alt="" />
          : <div className="detail-art placeholder" aria-hidden="true">{data.name.split(' ').map((w) => w[0]).join('').slice(0, 3)}</div>}
        <div className="detail-body">
          <span className="detail-type"><span className="type-badge" aria-hidden="true"><TypeGlyph type={data.type} /></span>{TYPE_LABEL[data.type]}</span>
          <p className="detail-text">{data.type === 'basic_unicorn' && !data.text ? 'A unicorn. No special powers, but it counts.' : data.text}</p>
        </div>
      </div>
      {inHand && (canPlay ? (
        needsTarget ? (
          <>
            <p className="sheet-sub">Play it into whose stable?</p>
            <div className="choices" data-testid="target">
              {players.map((p) => <button type="button" key={p.id} className="choice" onClick={() => onPlay(p.id)}>{p.name}</button>)}
            </div>
          </>
        ) : (
          <div className="choices">
            <button type="button" className="choice primary" data-testid="play" onClick={() => onPlay()}>Play {data.name}</button>
          </div>
        )
      ) : (
        <p className={`sheet-sub ${blockedBy ? 'blocked' : ''}`}>
          {blockedBy ? `Blocked: ${blockedBy}.`
            : data.type === 'instant' ? 'Instants are played when someone else plays a card. Watch for the Neigh window.'
            : myTurn ? 'This card can\'t be played right now.' : 'Wait for your turn to play this.'}
        </p>
      ))}
    </Sheet>
  );
}

/**
 * Bottom sheet. With `onClose` the X and a tap on the backdrop dismiss it. Without (a prompt the
 * game is waiting on) a backdrop tap only tucks it away so you can look at the table; a pill
 * brings it back.
 */
function Sheet({ title, children, onClose, testId, className }: { title: string; children: React.ReactNode; onClose?: () => void; testId?: string; className?: string }) {
  const [tucked, setTucked] = useState(false);
  useEffect(() => setTucked(false), [title]);
  if (tucked) {
    return (
      <div className="sheet-wrap tucked" data-testid={testId}>
        <button type="button" className="sheet-pill" onClick={() => setTucked(false)}>
          <span className="sheet-pill-title">{title}</span><span aria-hidden="true">▲</span>
        </button>
      </div>
    );
  }
  return (
    <div className={`sheet-wrap ${className ?? ''}`} role="dialog" aria-modal="true" aria-label={title} data-testid={testId}
      onClick={(e) => { if (e.target === e.currentTarget) (onClose ? onClose() : setTucked(true)); }}>
      <div className="sheet">
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="sheet-x" onClick={() => (onClose ? onClose() : setTucked(true))} aria-label={onClose ? 'Close' : 'Hide for now'}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PromptSheet({ prompt, view, onAnswer }: { prompt: Prompt; view: PlayerView; onAnswer: (a: Answer) => void }) {
  const [picked, setPicked] = useState<number[]>([]);
  useEffect(() => setPicked([]), [prompt.id]);
  const data = (id: number) => cardData.get(view.cards[id]!.def)!;
  const t = describePrompt(prompt, { player: (p) => view.players[p]!.name, card: (id) => data(id).name, cardText: (id) => data(id).text });
  const ownerOf = (id: number) => view.players.find((p) => p.stable.includes(id) || (p.hand ?? []).includes(id));

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
              {view.players[p]!.name}{p === view.me ? ' (me)' : ''} · {view.unicornCounts[p]} unicorns
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
          <div className="card-grid">
            {(prompt.options as number[]).map((id) => {
              const owner = ownerOf(id);
              const where = owner
                ? (owner.stable.includes(id) ? `${owner.id === view.me ? 'my' : owner.name + "'s"} stable` : `${owner.id === view.me ? 'my' : owner.name + "'s"} hand`)
                : view.discard.includes(id) ? 'discard' : view.nursery.includes(id) ? 'nursery' : 'deck';
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
    <Sheet title={t.title} testId="prompt">
      {t.hitBy && prompt.source !== undefined && (
        <div className="hit-by"><CardView data={data(prompt.source)} compact /><span className="sheet-sub">{t.sub}</span></div>
      )}
      {!t.hitBy && t.sub && <p className="sheet-sub">{t.sub}</p>}
      {t.instruction && <p className="instruction">{t.instruction}</p>}
      {body}
    </Sheet>
  );
}
