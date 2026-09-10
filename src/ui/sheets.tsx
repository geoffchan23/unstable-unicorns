// Bottom sheets: prompts, the Neigh window, the beginning of a turn, a card's detail, a stable, the history.
import { useEffect, useMemo, useState } from 'react';
import { cardData } from '../engine/registry';
import type { Action, Answer, BeginTurnWindow, CardData, InstanceId, LogEntry, PlayerId, Prompt } from '../engine/types';
import type { PlayerView } from '../engine/view';
import { CardView, TYPE_LABEL, TypeGlyph } from './Card';
import { artFor } from './art';
import { describePrompt } from './promptText';
import type { NeighWindowText } from './neighText';
import { groupTurns, tokenizeLine } from './turnLog';

/** The opened-up card: big art, full text, and whatever you can do with it right now. */
export function CardDetailSheet({ data, inHand, canPlay, myTurn, blockedBy, players, onPlay, onClose }: {
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
export function Sheet({ title, children, onClose, testId, className, closeTestId }: { title: string; children: React.ReactNode; onClose?: () => void; testId?: string; className?: string; closeTestId?: string }) {
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
          <button type="button" className="sheet-x" onClick={() => (onClose ? onClose() : setTucked(true))} aria-label={onClose ? 'Close' : 'Hide for now'} data-testid={closeTestId}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PromptSheet({ prompt, view, onAnswer }: { prompt: Prompt; view: PlayerView; onAnswer: (a: Answer) => void }) {
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

export function NeighSheet({ text, view, legal, onAction, onOpenCard, data }: {
  text: NeighWindowText; view: PlayerView; legal: Action[]; onAction: (a: Action) => void; onOpenCard: (id: InstanceId) => void; data: (id: InstanceId) => CardData;
}) {
  const canNeigh = legal.some((a) => a.type === 'neigh');
  return (
    <Sheet title={text.title} testId="neigh" className="light neigh-sheet">
      <p className="sheet-sub">{text.sub}</p>
      <div className="row wrap neigh-chips">
        <CardView data={data(text.base)} compact onClick={() => onOpenCard(text.base)} />
        {view.stack.slice(1).map((item) => (
          <CardView key={item.card} data={data(item.card)} compact onClick={() => onOpenCard(item.card)} badge={view.players[item.player]!.name} />
        ))}
      </div>
      <div className="choices">
        {legal.filter((a) => a.type === 'neigh').map((a) => (
          <button type="button" key={(a as { card: number }).card} className="choice neigh" onClick={() => onAction(a)}>
            {data((a as { card: number }).card).name}!
          </button>
        ))}
        <button type="button" className={`choice ${canNeigh ? '' : 'primary'}`} data-testid="pass" onClick={() => onAction({ type: 'pass', player: view.me })}>{text.ok}</button>
      </div>
    </Sheet>
  );
}

export function BeginSheet({ pending, view, onAction, onOpenCard, data }: {
  pending: BeginTurnWindow; view: PlayerView; onAction: (a: Action) => void; onOpenCard: (id: InstanceId) => void; data: (id: InstanceId) => CardData;
}) {
  return (
    <Sheet title="Beginning of your turn" testId="begin">
      <p className="sheet-sub">
        Use your stable's beginning-of-turn cards in any order, then draw.
        {pending.mandatory.length > 0 && ' Cards marked "must resolve" happen either way.'}
      </p>
      <ol className="begin-list">
        {pending.options.map((c) => {
          const must = pending.mandatory.includes(c);
          return (
            <li key={c}>
              <CardView data={data(c)} compact onClick={() => onOpenCard(c)} />
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
          {pending.mandatory.length > 0 ? 'Resolve the rest and draw' : 'Skip these and draw a card'}
        </button>
      </div>
    </Sheet>
  );
}

/** Someone's stable (and their hand, under a Nanny Cam), opened from their seat. */
export function StableSheet({ player, view, onClose, onOpenCard, data, isMe }: {
  player: PlayerId; view: PlayerView; onClose: () => void; onOpenCard: (id: InstanceId) => void; data: (id: InstanceId) => CardData; isMe: boolean;
}) {
  const p = view.players[player]!;
  const who = isMe ? 'Your' : `${p.name}'s`;
  return (
    <Sheet title={`${who} stable`} onClose={onClose} testId="expanded" closeTestId="expanded-close">
      <p className="sheet-sub">{view.unicornCounts[player]} of {view.unicornsToWin} Unicorns{p.hand === null ? ` · ${p.handCount} cards in hand` : ''}</p>
      <div className="card-grid">
        {p.stable.length === 0 && <span className="empty">Nothing here yet.</span>}
        {p.stable.map((c) => <CardView key={c} data={data(c)} onClick={() => onOpenCard(c)} />)}
      </div>
      {!isMe && p.hand && (
        <>
          <h3>{p.name}'s hand (Nanny Cam)</h3>
          <div className="card-grid">{p.hand.map((c) => <CardView key={c} data={data(c)} onClick={() => onOpenCard(c)} />)}</div>
        </>
      )}
    </Sheet>
  );
}

/** The full story, one turn per page. */
export function HistorySheet({ log, start, onClose, onOpenDef }: { log: LogEntry[]; start: number | null; onClose: () => void; onOpenDef: (d: CardData) => void }) {
  const turns = useMemo(() => groupTurns(log), [log]);
  const [page, setPage] = useState(start ?? turns.length - 1);
  const byName = useMemo(() => new Map([...cardData.values()].map((d) => [d.name, d] as const)), []);
  const allNames = useMemo(() => [...byName.keys()], [byName]);
  const cur = turns[Math.min(page, turns.length - 1)];
  if (!cur) return null;
  return (
    <Sheet title={cur.player ? `${cur.player}'s turn` : 'Setup'} onClose={onClose} testId="history">
      <div className="history-nav">
        <button type="button" className="ghost small" disabled={page <= 0} onClick={() => setPage(page - 1)}>◀ Earlier</button>
        <span className="history-pos">Turn {cur.turn}{cur.player ? '' : ' · before play'} · {page + 1} of {turns.length}</span>
        <button type="button" className="ghost small" disabled={page >= turns.length - 1} onClick={() => setPage(page + 1)}>Later ▶</button>
      </div>
      <ol className="history-lines">
        {cur.lines.map((l, i) => (
          <li key={i} className={l.notice ? 'notice' : ''}>
            {tokenizeLine(l.text, allNames).map((part, j) => part.card
              ? <button type="button" key={j} className={`cardref t-${byName.get(part.card)!.type}`} onClick={() => onOpenDef(byName.get(part.card!)!)}>{part.text}</button>
              : <span key={j}>{part.text}</span>)}
          </li>
        ))}
        {cur.lines.length === 0 && <li className="empty">Nothing happened yet this turn.</li>}
      </ol>
    </Sheet>
  );
}
