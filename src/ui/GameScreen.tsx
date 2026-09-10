// The table. Presentational: everything it knows comes in as props; the staged playback (useStage) keeps a
// picture that lags behind the real view while cards fly, and the sheets that need a decision wait for it.
import { useEffect, useState } from 'react';
import { cardData } from '../engine/registry';
import type { Action, CardData, InstanceId, PlayerId } from '../engine/types';
import type { PlayerView } from '../engine/view';
import { describeNeighWindow } from './neighText';
import { useWakeLock } from './pwa/wakeLock';
import type { SeatInfo } from './seats';
import { useStage } from './stage/useStage';
import { Flyer } from './stage/Flyer';
import { Seats } from './table/Seats';
import { Centre } from './table/Centre';
import { Mine, type DropTarget } from './table/Mine';
import { TurnBanner } from './table/TurnBanner';
import { BeginSheet, CardDetailSheet, HistorySheet, NeighSheet, PromptSheet, StableSheet } from './sheets';
import { WinOverlay } from './table/WinOverlay';

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
  view: live, legal, seats, onAction, onQuit, error, onDismissError, youLabel, banner, renderWin, children, seed, report,
}: GameScreenProps) {
  useWakeLock(true);
  const stage = useStage(live);
  const view = stage.shown;
  const busy = stage.busy;

  const [copied, setCopied] = useState<string | null>(null);
  const copyReport = async () => {
    if (!report) return;
    const text = report();
    try { await navigator.clipboard.writeText(text); setCopied('Game report copied. Paste it into a message to reproduce this game.'); }
    catch { setCopied(`Could not copy. Seed ${seed ?? '?'}.`); }
    setTimeout(() => setCopied(null), 4000);
  };

  const data = (id: InstanceId) => cardData.get(live.cards[id]?.def ?? view.cards[id]!.def)!;
  const myTurn = !busy && live.turn.player === live.me && live.turn.phase === 'action' && !live.pending && live.winner === null;
  const playable = new Set(legal.filter((a) => a.type === 'play').map((a) => (a as { card: InstanceId }).card));
  const canDraw = legal.some((a) => a.type === 'draw');

  const [detail, setDetail] = useState<{ id: InstanceId | null; data: CardData; fromHand?: boolean } | null>(null);
  const [history, setHistory] = useState(false);
  const [expanded, setExpanded] = useState<PlayerId | null>(null);
  const openCard = (id: InstanceId) => setDetail({ id, data: data(id) });
  const openHandCard = (id: InstanceId) => setDetail({ id, data: data(id), fromHand: true });
  const openDef = (d: CardData) => setDetail({ id: null, data: d });

  // the hand in the order the player arranged it (dragging in the fan); new cards join at the end
  const [handOrder, setHandOrder] = useState<InstanceId[]>([]);
  const rawHand = view.players[view.me]!.hand ?? [];
  const hand = [...handOrder.filter((c) => rawHand.includes(c)), ...rawHand.filter((c) => !handOrder.includes(c))];
  const liveHand = live.players[live.me]!.hand ?? [];
  const browse = detail?.fromHand && detail.id !== null && liveHand.includes(detail.id)
    ? [...handOrder.filter((c) => liveHand.includes(c)), ...liveHand.filter((c) => !handOrder.includes(c))]
    : null;
  const browseIndex = browse && detail?.id !== null && detail ? browse.indexOf(detail.id!) : -1;

  // an accidental reload or swipe-back should not throw the game away
  useEffect(() => {
    if (live.winner !== null || navigator.webdriver) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [live.winner]);

  // dragging a card out of the hand onto the table (or a seat, for Upgrades and Downgrades)
  const [dragOver, setDragOver] = useState<{ target: DropTarget | null; lifting: boolean }>({ target: null, lifting: false });
  const dropCard = (card: InstanceId, target: DropTarget) => {
    if (!myTurn || !playable.has(card)) return;
    const needsTarget = data(card).type === 'upgrade' || data(card).type === 'downgrade';
    if (needsTarget && target.kind === 'table') { openHandCard(card); return; }
    onAction({ type: 'play', player: live.me, card, ...(needsTarget && target.kind === 'seat' ? { targetPlayer: target.player } : {}) });
  };

  const inHand = (id: InstanceId) => (live.players[live.me]!.hand ?? []).includes(id);
  const playDetail = (target?: PlayerId) => {
    if (!detail || detail.id === null) return;
    onAction({ type: 'play', player: live.me, card: detail.id, ...(target !== undefined ? { targetPlayer: target } : {}) });
    setDetail(null);
  };

  // decisions wait until the picture has caught up with the engine
  const prompt = !busy && live.pending?.kind === 'prompt' && live.pending.prompt.player === live.me ? live.pending.prompt : null;
  const neighWindow = !busy && live.pending?.kind === 'neighWindow' && live.pending.awaiting.includes(live.me) ? live.pending : null;
  const beginWindow = !busy && live.pending?.kind === 'beginTurn' && live.pending.player === live.me ? live.pending : null;
  const canNeigh = legal.some((a) => a.type === 'neigh');
  const names = { player: (p: PlayerId) => live.players[p]!.name, card: (id: InstanceId) => data(id).name, isMagic: (id: InstanceId) => data(id).type === 'magic' };
  const neighText = live.stack.length && live.pending?.kind === 'neighWindow' ? describeNeighWindow(live.stack, live.me, names, canNeigh) : null;
  const stageBanner = !busy && neighText && live.pending?.kind === 'neighWindow'
    ? `${neighText.banner} · waiting on ${live.pending.awaiting.map((p) => live.players[p]!.name).join(', ')}`
    : null;

  // notices: things that happened without a prompt ("no Magic cards in the discard pile") get a toast
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!stage.notice) return;
    setNotice(stage.notice.text);
    const id = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(id);
  }, [stage.notice]);

  const winner = !busy ? live.winner : null;

  return (
    <div className={`tbl ${busy ? 'busy' : ''}`}>
      <header className="topbar" data-testid="topbar">
        <button type="button" className="ghost small" onClick={onQuit}>Quit</button>
        <span className="topbar-meta">
          Turn {view.turn.number} · first to {view.unicornsToWin}
        </span>
        <button type="button" className="ghost small" onClick={() => setHistory(true)} data-testid="history-open" aria-label="Turn history">History</button>
      </header>
      {banner}

      <Seats view={view} seats={seats} anchors={stage.anchors} hidden={stage.hidden} fx={stage.fx} bubbles={stage.bubbles} hit={stage.hit} onOpen={setExpanded} data={data}
        dropOver={dragOver.target?.kind === 'seat' ? dragOver.target.player : null} />
      <Centre view={view} anchors={stage.anchors} hidden={stage.hidden} fx={stage.fx} stamps={stage.stamps} data={data} onOpenCard={openCard} neighBanner={stageBanner}
        drop={dragOver.lifting ? (dragOver.target?.kind === 'table' ? 'over' : 'ready') : null} />
      <Mine
        view={view} seats={seats} anchors={stage.anchors} hidden={stage.hidden} fx={stage.fx} bubbles={stage.bubbles} hit={stage.hit}
        myTurn={myTurn} playable={playable} canDraw={canDraw} data={data} youLabel={youLabel ?? ' (you)'} hand={hand} onReorder={setHandOrder}
        onDraw={() => onAction({ type: 'draw', player: live.me })} onOpenCard={openCard} onOpenHandCard={openHandCard} onOpenStable={() => setExpanded(live.me)}
        onDrop={dropCard} onDragOver={(target, lifting) => setDragOver({ target, lifting })} lifting={dragOver.lifting}
      />

      <TurnBanner banner={stage.banner} view={view} seats={seats} />
      {stage.flyers.map((f) => <Flyer key={f.id} spec={f} />)}

      {/* ---------- sheets ---------- */}
      {history && <HistorySheet log={live.log} start={null} onClose={() => setHistory(false)} onOpenDef={openDef} seed={seed} onCopyReport={report ? copyReport : undefined} />}
      {expanded !== null && <StableSheet player={expanded} view={live} isMe={expanded === live.me} onClose={() => setExpanded(null)} onOpenCard={openCard} data={data} />}
      {neighWindow && neighText && <NeighSheet text={neighText} view={live} legal={legal} onAction={onAction} onOpenCard={openCard} data={data} />}
      {prompt && <PromptSheet prompt={prompt} view={live} onAnswer={(answer) => onAction({ type: 'respond', player: live.me, promptId: prompt.id, answer })} />}
      {beginWindow && <BeginSheet pending={beginWindow} view={live} onAction={onAction} onOpenCard={openCard} data={data} />}

      {detail && (
        <CardDetailSheet
          data={detail.data}
          inHand={detail.id !== null && inHand(detail.id)}
          canPlay={detail.id !== null && inHand(detail.id) && myTurn && playable.has(detail.id)}
          blockedBy={detail.id !== null ? live.playBlocks[detail.id] ?? null : null}
          myTurn={myTurn}
          players={live.players.map((p) => ({ id: p.id, name: p.id === live.me ? `${p.name} (me)` : p.name }))}
          onPlay={playDetail}
          onClose={() => setDetail(null)}
          nav={browse && browseIndex >= 0 ? {
            index: browseIndex, total: browse.length,
            go: (i) => { const id = browse[(i + browse.length) % browse.length]!; setDetail({ id, data: data(id), fromHand: true }); },
          } : null}
        />
      )}

      {children}

      {winner !== null && (
        <WinOverlay winner={winner} view={live} seats={seats}>
          {renderWin ? renderWin(winner) : <button type="button" className="primary big" onClick={onQuit}>New game</button>}
        </WinOverlay>
      )}

      {error && <div className="toast" role="alert" onClick={onDismissError}>{error}</div>}
      {!error && copied && <div className="toast notice" role="status" onClick={() => setCopied(null)}>{copied}</div>}
      {!error && notice && <div className="toast notice" role="status" data-testid="notice" onClick={() => setNotice(null)}>{notice}</div>}
    </div>
  );
}
