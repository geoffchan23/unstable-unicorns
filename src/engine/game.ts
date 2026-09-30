import type { Action, Answer, GameState, InstanceId, PlayerId, Prompt, StackItem } from './types';
import { shuffleInPlace } from './rng';
import { allCardData, hasDef } from './registry';
import { Ctx, GameWon, runEffect, systemCtx } from './effects';
import { cloneState } from './clone';
import { emit, moved, say } from './events';
import {
  defOf, effectsActive, hasNeighImmunity, isNeighCard, isUnicornType, nameOf, neighAllowed,
  others, typeOf, vetoPlay,
} from './queries';

export interface GameOptions {
  players: string[];
  seed?: number;
  /** apply the official 2-player card removals and starting Neighs. Defaults to true for 2 players. */
  twoPlayerVariant?: boolean;
}

export const HAND_LIMIT = 7;

// ---------- setup ----------

export function createGame(opts: GameOptions): GameState {
  const n = opts.players.length;
  if (n < 2 || n > 8) throw new Error('2-8 players');
  const twoPlayer = opts.twoPlayerVariant ?? n === 2;
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);

  const state: GameState = {
    seed,
    rng: seed >>> 0,
    players: opts.players.map((name, id) => ({ id, name, hand: [], stable: [] })),
    unicornsToWin: n >= 6 ? 6 : 7,
    cards: {},
    deck: [],
    discard: [],
    nursery: [],
    limbo: [],
    turn: { player: 0, phase: 'begin', beginTurnQueued: false, playsRemaining: 1, extraTurns: 0, endDiscardQueued: false, number: 1, beginDone: [] },
    stack: [],
    pending: null,
    effectQueue: [],
    nextPromptId: 1,
    log: [],
    events: [],
    winner: null,
    twoPlayerVariant: twoPlayer,
  };

  let nextId = 1;
  for (const data of allCardData()) {
    if (!hasDef(data.id)) throw new Error(`Card ${data.id} has no definition`);
    if (twoPlayer && data.removedInTwoPlayer) continue;
    for (let i = 0; i < data.count; i++) {
      const id = nextId++;
      state.cards[id] = { id, def: data.id };
      if (data.type === 'baby_unicorn') state.nursery.push(id);
      else state.deck.push(id);
    }
  }

  shuffleInPlace(state, state.nursery);
  shuffleInPlace(state, state.deck);

  for (const p of state.players) {
    const baby = state.nursery.pop();
    if (baby === undefined) throw new Error('not enough Baby Unicorns');
    p.stable.push(baby);
  }
  if (twoPlayer) {
    for (const p of state.players) {
      const i = state.deck.findIndex((c) => state.cards[c]!.def === 'neigh');
      if (i >= 0) p.hand.push(state.deck.splice(i, 1)[0]!);
    }
    shuffleInPlace(state, state.deck);
  }
  for (let i = 0; i < 5; i++) for (const p of state.players) p.hand.push(state.deck.pop()!);

  say(state, { text: `Game start. ${n} players, first to ${state.unicornsToWin} Unicorns.` });
  say(state, { text: `--- ${state.players[state.turn.player]!.name}'s turn ---` });
  emit(state, { kind: 'turn', player: state.turn.player, number: state.turn.number });
  run(state);
  return state;
}

// ---------- the main loop ----------

/** Advance the game until it needs player input or is over. Mutates and returns state. */
export function run(state: GameState): GameState {
  for (let guard = 0; guard < 10_000; guard++) {
    if (state.winner !== null) return state;
    if (state.pending) return state;

    const head = state.effectQueue[0];
    if (head) {
      const res = runEffect(state, head);
      if (res.done) {
        Object.assign(state, res.state);
      } else {
        state.pending = { kind: 'prompt', prompt: res.prompt };
      }
      continue;
    }

    if (state.stack.length) {
      try {
        resolveStack(state);
      } catch (e) {
        if (!(e instanceof GameWon)) throw e;
      }
      continue;
    }

    const t = state.turn;
    switch (t.phase) {
      case 'begin': {
        const p = t.player;
        const eligible = state.players[p]!.stable.filter((c) => defOf(state, c).onBeginTurn && effectsActive(state, c) && !t.beginDone.includes(c));
        const auto = eligible.filter((c) => defOf(state, c).beginTurn === 'auto');
        if (auto.length) {
          for (const c of auto) { t.beginDone.push(c); state.effectQueue.push({ kind: 'card', card: c, handler: 'onBeginTurn', controller: p, answers: [] }); }
          break;
        }
        if (eligible.length === 0) { t.beginTurnQueued = true; t.phase = 'draw'; break; }
        state.pending = { kind: 'beginTurn', player: p, options: eligible, mandatory: eligible.filter((c) => defOf(state, c).beginTurn === 'mandatory') };
        return state;
      }
      case 'draw': {
        try {
          systemCtx(state, t.player).draw(t.player, 1);
        } catch (e) {
          if (!(e instanceof GameWon)) throw e;
          break;
        }
        t.phase = 'action';
        break;
      }
      case 'action':
        if (t.playsRemaining <= 0) { t.phase = 'end'; break; }
        return state; // wait for the player
      case 'end':
        if (!t.endDiscardQueued) {
          t.endDiscardQueued = true;
          state.effectQueue.push({ kind: 'builtin', name: 'endTurnDiscard', player: t.player, answers: [] });
        } else {
          nextTurn(state);
        }
        break;
    }
  }
  throw new Error('run: exceeded step guard');
}


function nextTurn(state: GameState): void {
  const t = state.turn;
  if (t.extraTurns > 0) {
    t.extraTurns--;
    say(state, { text: `${state.players[t.player]!.name} takes another turn.`, actor: t.player });
  } else {
    t.player = (t.player + 1) % state.players.length;
  }
  t.number++;
  t.phase = 'begin';
  t.beginTurnQueued = false;
  t.beginDone = [];
  t.endDiscardQueued = false;
  t.playsRemaining = 1;
  say(state, { text: `--- ${state.players[t.player]!.name}'s turn ---` });
  emit(state, { kind: 'turn', player: t.player, number: t.number });
}

// ---------- the Neigh stack ----------

function openNeighWindow(state: GameState, stackIndex: number): void {
  const item = state.stack[stackIndex]!;
  const def = defOf(state, item.card);
  const immune = hasNeighImmunity(state, item.player) || state.cards[item.card]!.def === 'super-neigh';
  const awaiting = immune ? [] : others(state, item.player).filter((p) => neighAllowed(state, p));
  if (awaiting.length === 0) {
    state.pending = null; // resolves on the next loop iteration
  } else {
    state.pending = { kind: 'neighWindow', stackIndex, awaiting };
  }
  void def;
}

function resolveStack(state: GameState): void {
  const items = state.stack;
  const n = items.length;
  // top item is live; each live Neigh cancels the item beneath it
  const live: boolean[] = new Array(n).fill(false);
  for (let i = n - 1; i >= 0; i--) live[i] = i === n - 1 ? true : !live[i + 1];
  const ctx = systemCtx(state, state.turn.player);

  // all Neighs go to the discard pile
  // each Neigh is discarded by the player who played it, not by whoever's turn it is
  for (let i = n - 1; i >= 1; i--) ctx.toDiscard(items[i]!.card, 'resolve', items[i]!.player);

  const base = items[0]!;
  state.stack = [];
  if (!live[0]) {
    say(state, { text: `${nameOf(state, base.card)} is Neigh'd!` });
    ctx.toDiscard(base.card, 'countered');
    return;
  }
  resolvePlayedCard(state, ctx, base);
}

function resolvePlayedCard(state: GameState, ctx: Ctx, item: StackItem): void {
  const t = typeOf(state, item.card);
  if (isUnicornType(t)) {
    if (!ctx.enterStable(item.card, item.player, 'play')) ctx.toDiscard(item.card);
  } else if (t === 'upgrade' || t === 'downgrade') {
    const target = item.targetPlayer ?? item.player;
    if (!ctx.enterStable(item.card, target, 'play')) ctx.toDiscard(item.card);
  } else if (t === 'magic') {
    state.effectQueue.push({ kind: 'card', card: item.card, handler: 'onPlayMagic', controller: item.player, answers: [] });
    // the card itself goes to the discard pile once its effect has finished (unless it moved itself)
    state.effectQueue.push({ kind: 'builtin', name: 'discardLimbo', player: item.player, answers: [], card: item.card });
  } else {
    // a lone Instant at the bottom of the stack cannot happen (Neighs answer something)
    ctx.toDiscard(item.card);
  }
}

// ---------- actions ----------

export function legalActions(state: GameState, player: PlayerId): Action[] {
  if (state.winner !== null) return [];
  const out: Action[] = [];
  const pend = state.pending;
  if (pend && pend.kind === 'beginTurn') {
    if (pend.player !== player) return [];
    return [...pend.options.map((c): Action => ({ type: 'beginTurn', player, card: c })), { type: 'beginTurn', player, card: null }];
  }
  if (pend) {
    if (pend.kind === 'prompt') {
      if (pend.prompt.player !== player) return [];
      return promptActions(pend.prompt, player);
    }
    if (!pend.awaiting.includes(player)) return [];
    out.push({ type: 'pass', player });
    for (const c of state.players[player]!.hand) {
      if (isNeighCard(state, c) && vetoPlay(state, player, c) === null) out.push({ type: 'neigh', player, card: c });
    }
    return out;
  }
  const t = state.turn;
  if (t.phase !== 'action' || t.player !== player) return [];
  out.push({ type: 'draw', player });
  for (const c of state.players[player]!.hand) {
    const type = typeOf(state, c);
    if (type === 'instant') continue;
    if (vetoPlay(state, player, c) !== null) continue;
    if (type === 'upgrade' || type === 'downgrade') {
      for (const p of state.players) out.push({ type: 'play', player, card: c, targetPlayer: p.id });
    } else {
      out.push({ type: 'play', player, card: c });
    }
  }
  return out;
}

function promptActions(prompt: Prompt, player: PlayerId): Action[] {
  const base = { type: 'respond' as const, player, promptId: prompt.id };
  const out: Action[] = [];
  switch (prompt.kind) {
    case 'confirm':
      out.push({ ...base, answer: true }, { ...base, answer: false });
      break;
    case 'chooseCard':
      if (prompt.count && prompt.count > 1) {
        // enumerate a handful of combinations for bots; UI sends arrays directly
        const opts = prompt.options as number[];
        const combos = combinations(opts, prompt.count).slice(0, 50);
        for (const c of combos) out.push({ ...base, answer: c });
      } else {
        for (const o of prompt.options) out.push({ ...base, answer: o as number });
      }
      if (prompt.optional) out.push({ ...base, answer: null });
      break;
    case 'choosePlayer':
    case 'chooseOption':
      for (const o of prompt.options) out.push({ ...base, answer: o });
      if (prompt.optional) out.push({ ...base, answer: null });
      break;
    case 'orderCards':
      out.push({ ...base, answer: prompt.options as number[] });
      break;
  }
  return out;
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [head, ...rest] = arr as [T, ...T[]];
  return [...combinations(rest, k - 1).map((c) => [head, ...c]), ...combinations(rest, k)];
}

export class IllegalAction extends Error {}

/**
 * While a prompt is open, the head effect has partially run (e.g. a card was already
 * sacrificed before "destroy which card?" is asked). Re-run it to get the in-progress
 * state for display. Cheap and deterministic. Returns `state` itself when nothing is pending.
 */
export function previewState(state: GameState): GameState {
  const pend = state.pending;
  const head = state.effectQueue[0];
  if (!pend || pend.kind !== 'prompt' || !head) return state;
  const res = runEffect(state, head);
  return res.done ? res.state : res.preview;
}

/** Pure: returns a new state. Throws IllegalAction if the action is not allowed. */
export function applyAction(input: GameState, action: Action): GameState {
  const state = cloneState(input);
  if (state.winner !== null) throw new IllegalAction('game is over');
  const pend = state.pending;

  switch (action.type) {
    case 'respond': {
      if (!pend || pend.kind !== 'prompt') throw new IllegalAction('no prompt pending');
      const prompt = pend.prompt;
      if (prompt.id !== action.promptId || prompt.player !== action.player) throw new IllegalAction('wrong prompt');
      validateAnswer(prompt, action.answer);
      const head = state.effectQueue[0];
      if (!head) throw new IllegalAction('no effect waiting');
      head.answers.push(action.answer);
      state.nextPromptId++;
      state.pending = null;
      break;
    }
    case 'pass': {
      if (!pend || pend.kind !== 'neighWindow') throw new IllegalAction('no Neigh window');
      if (!pend.awaiting.includes(action.player)) throw new IllegalAction('not awaiting you');
      pend.awaiting = pend.awaiting.filter((p) => p !== action.player);
      if (pend.awaiting.length === 0) state.pending = null;
      break;
    }
    case 'beginTurn': {
      if (!pend || pend.kind !== 'beginTurn') throw new IllegalAction('it is not the beginning of a turn');
      if (pend.player !== action.player) throw new IllegalAction('not your turn');
      const t = state.turn;
      const use = (c: InstanceId) => state.effectQueue.push({ kind: 'card', card: c, handler: 'onBeginTurn', controller: action.player, answers: [], payload: { chosen: true } });
      if (action.card === null) {
        for (const c of pend.mandatory) use(c);
        t.beginDone.push(...pend.options);
      } else {
        if (!pend.options.includes(action.card)) throw new IllegalAction('that card has no beginning-of-turn effect to use now');
        say(state, { text: `${state.players[action.player]!.name} uses ${nameOf(state, action.card)}.`, actor: action.player });
        use(action.card);
        t.beginDone.push(action.card);
      }
      state.pending = null;
      break;
    }
    case 'neigh': {
      if (!pend || pend.kind !== 'neighWindow') throw new IllegalAction('no Neigh window');
      if (!pend.awaiting.includes(action.player)) throw new IllegalAction('not awaiting you');
      const hand = state.players[action.player]!.hand;
      if (!hand.includes(action.card) || !isNeighCard(state, action.card)) throw new IllegalAction('not a Neigh in hand');
      const veto = vetoPlay(state, action.player, action.card);
      if (veto) throw new IllegalAction(veto);
      hand.splice(hand.indexOf(action.card), 1);
      state.limbo.push(action.card);
      const answering = pend.stackIndex;
      state.stack.push({ card: action.card, player: action.player, answering });
      say(state, { text: `${state.players[action.player]!.name} plays ${nameOf(state, action.card)}!`, actor: action.player });
      moved(state, action.card, { zone: 'hand', player: action.player }, { zone: 'limbo' }, 'neigh', action.player);
      openNeighWindow(state, state.stack.length - 1);
      break;
    }
    case 'draw': {
      requireActionPhase(state, action.player);
      try {
        systemCtx(state, action.player).draw(action.player, 1);
      } catch (e) {
        if (!(e instanceof GameWon)) throw e;
      }
      state.turn.playsRemaining = 0;
      break;
    }
    case 'play': {
      requireActionPhase(state, action.player);
      const hand = state.players[action.player]!.hand;
      if (!hand.includes(action.card)) throw new IllegalAction('card not in hand');
      const type = typeOf(state, action.card);
      if (type === 'instant') throw new IllegalAction('Neighs are played in response, not as an action');
      const veto = vetoPlay(state, action.player, action.card);
      if (veto) throw new IllegalAction(veto);
      let targetPlayer: PlayerId | undefined;
      if (type === 'upgrade' || type === 'downgrade') {
        targetPlayer = action.targetPlayer ?? action.player;
        if (!state.players[targetPlayer]) throw new IllegalAction('bad target');
      }
      hand.splice(hand.indexOf(action.card), 1);
      state.limbo.push(action.card);
      state.turn.playsRemaining--;
      state.stack.push({ card: action.card, player: action.player, targetPlayer });
      {
        const who = state.players[action.player]!.name;
        const onto = targetPlayer === undefined ? '' : targetPlayer === action.player ? ' on themselves' : ` on ${state.players[targetPlayer]!.name}`;
        say(state, { text: `${who} plays ${nameOf(state, action.card)}${onto}.`, actor: action.player, ...(targetPlayer !== undefined && targetPlayer !== action.player ? { affects: [targetPlayer] } : {}) });
      }
      moved(state, action.card, { zone: 'hand', player: action.player }, { zone: 'limbo' }, 'play', action.player);
      openNeighWindow(state, 0);
      break;
    }
  }
  return run(state);
}

function requireActionPhase(state: GameState, player: PlayerId): void {
  if (state.pending) throw new IllegalAction('waiting on a response');
  if (state.turn.phase !== 'action') throw new IllegalAction('not the action phase');
  if (state.turn.player !== player) throw new IllegalAction('not your turn');
  if (state.turn.playsRemaining <= 0) throw new IllegalAction('no actions left');
}

function validateAnswer(prompt: Prompt, answer: Answer): void {
  const bad = () => new IllegalAction(`invalid answer for ${prompt.kind}`);
  if (answer === null) {
    if (!prompt.optional) throw bad();
    return;
  }
  switch (prompt.kind) {
    case 'confirm':
      if (typeof answer !== 'boolean') throw bad();
      return;
    case 'chooseCard':
      if (prompt.count && prompt.count > 1) {
        if (!Array.isArray(answer) || answer.length !== prompt.count) throw bad();
        if (new Set(answer).size !== answer.length) throw bad();
        for (const a of answer) if (!prompt.options.includes(a)) throw bad();
        return;
      }
      if (typeof answer !== 'number' || !prompt.options.includes(answer)) throw bad();
      return;
    case 'choosePlayer':
      if (typeof answer !== 'number' || !prompt.options.includes(answer)) throw bad();
      return;
    case 'chooseOption':
      if (typeof answer !== 'string' || !prompt.options.includes(answer)) throw bad();
      return;
    case 'orderCards':
      if (!Array.isArray(answer)) throw bad();
      return;
  }
}
