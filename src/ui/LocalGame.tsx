import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createGame, applyAction, legalActions, IllegalAction } from '../engine/game';
import { viewFor } from '../engine/view';
import { playersToAct, greedyBotAction } from '../engine/bot';
import type { Action, GameState, PlayerId } from '../engine/types';
import { GameScreen } from './GameScreen';
import type { Seat, SeatInfo } from './seats';

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function LocalGame({ seats, seed, onQuit }: { seats: Seat[]; seed: number; onQuit: () => void }) {
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
  // every action applied, in order: with the seed and seats this replays the whole game (scripts/replay.ts)
  const history = useRef<Action[]>([]);
  const dispatch = useCallback((a: Action) => {
    setState((s) => {
      try {
        const next = applyAction(s, a);
        history.current.push(a);
        return next;
      } catch (e) {
        if (e instanceof IllegalAction) { setError(e.message); return s; }
        throw e;
      }
    });
  }, []);
  const report = useCallback(() => JSON.stringify({ kind: 'unstable-unicorns-game', seed, seats, actions: history.current }), [seed, seats]);

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

  const view = useMemo(() => viewFor(state, viewer), [state, viewer]);
  const legal = useMemo(() => legalActions(state, viewer), [state, viewer]);
  const seatInfos: SeatInfo[] = seats.map((s) => ({ ...s, connected: true }));
  return (
    <GameScreen view={view} legal={legal} seats={seatInfos} onAction={dispatch} onQuit={onQuit} seed={seed} report={report}
      error={error} onDismissError={() => setError(null)} youLabel={humans.length > 1 ? '' : ' (you)'}>
      {handoffTo !== null && (
        <div className="overlay">
          <div className="overlay-box">
            <h2>Pass the device to {state.players[handoffTo]!.name}</h2>
            <p>{state.players[handoffTo]!.name} has a decision to make. Tap when only they can see the screen.</p>
            <button type="button" className="primary big" onClick={() => { setViewer(handoffTo); setHandoffTo(null); }}>I'm {state.players[handoffTo]!.name}</button>
          </div>
        </div>
      )}
    </GameScreen>
  );
}
