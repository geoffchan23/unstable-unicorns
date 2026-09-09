import '../cards';
import { createGame, applyAction, legalActions } from '../game';
import type { Action, Answer, GameState, InstanceId, PlayerId, Prompt } from '../types';
import { cloneState } from '../clone';

export interface SetupOptions {
  players?: number;
  seed?: number;
  /** def ids to put in each player's hand (in addition to nothing: hands start empty). */
  hands?: string[][];
  /** def ids to put in each player's stable. A baby unicorn is added unless `babies` is false. */
  stables?: string[][];
  babies?: boolean;
  /** def ids to place on top of the deck (first element drawn first). */
  deckTop?: string[];
  /** def ids to put in the discard pile. */
  discard?: string[];
  twoPlayerVariant?: boolean;
  /** which player's action phase to start in (default 0) */
  turnPlayer?: PlayerId;
  /** actions available this turn (default 1). Card tests use a large number so the turn does not advance. */
  plays?: number;
}

export class Harness {
  state: GameState;

  constructor(opts: SetupOptions = {}) {
    const n = opts.players ?? 3;
    let s = createGame({
      players: Array.from({ length: n }, (_, i) => `P${i + 1}`),
      seed: opts.seed ?? 7,
      twoPlayerVariant: opts.twoPlayerVariant ?? false,
    });
    s = cloneState(s);
    // reset zones: everything back to the deck except babies
    const all = Object.keys(s.cards).map(Number);
    s.deck = [];
    s.discard = [];
    s.limbo = [];
    s.nursery = [];
    for (const p of s.players) { p.hand = []; p.stable = []; }
    for (const id of all) {
      if (s.cards[id]!.def.startsWith('baby-')) s.nursery.push(id); else s.deck.push(id);
    }
    const take = (def: string, from: InstanceId[] = s.deck): InstanceId => {
      const i = from.findIndex((c) => s.cards[c]!.def === def);
      if (i < 0) throw new Error(`harness: no ${def} available`);
      return from.splice(i, 1)[0]!;
    };
    s.players.forEach((p, i) => {
      if (opts.babies !== false) p.stable.push(s.nursery.pop()!);
      for (const d of opts.stables?.[i] ?? []) p.stable.push(d.startsWith('baby-') ? take(d, s.nursery) : take(d));
      for (const d of opts.hands?.[i] ?? []) p.hand.push(take(d));
    });
    for (const d of opts.discard ?? []) s.discard.push(take(d));
    const top = (opts.deckTop ?? []).map((d) => take(d));
    s.deck.push(...top.reverse()); // last element of deck is the top
    s.turn = {
      player: opts.turnPlayer ?? 0, phase: 'action', beginTurnQueued: true, playsRemaining: opts.plays ?? 1,
      extraTurns: 0, endDiscardQueued: false, number: 1, beginDone: [],
    };
    s.pending = null;
    s.effectQueue = [];
    s.stack = [];
    s.winner = null;
    this.state = s;
  }

  // ---------- lookups ----------

  defs(ids: InstanceId[]): string[] { return ids.map((c) => this.state.cards[c]!.def); }
  hand(p: PlayerId): string[] { return this.defs(this.state.players[p]!.hand); }
  stable(p: PlayerId): string[] { return this.defs(this.state.players[p]!.stable); }
  discard(): string[] { return this.defs(this.state.discard); }
  nursery(): string[] { return this.defs(this.state.nursery); }
  deckTop(n = 1): string[] { return this.defs(this.state.deck.slice(-n).reverse()); }
  deckSize(): number { return this.state.deck.length; }
  inHand(p: PlayerId, def: string): InstanceId {
    const c = this.state.players[p]!.hand.find((x) => this.state.cards[x]!.def === def);
    if (c === undefined) throw new Error(`${def} not in hand of P${p + 1}`);
    return c;
  }
  inStable(p: PlayerId, def: string): InstanceId {
    const c = this.state.players[p]!.stable.find((x) => this.state.cards[x]!.def === def);
    if (c === undefined) throw new Error(`${def} not in stable of P${p + 1}`);
    return c;
  }
  prompt(): Prompt | null {
    const p = this.state.pending;
    return p && p.kind === 'prompt' ? p.prompt : null;
  }
  neighWindow() {
    const p = this.state.pending;
    return p && p.kind === 'neighWindow' ? p : null;
  }
  legal(p: PlayerId): Action[] { return legalActions(this.state, p); }

  // ---------- actions ----------

  apply(a: Action): this { this.state = applyAction(this.state, a); return this; }

  /** play a card from hand; auto-pass every Neigh window unless `neighs` is given. */
  play(p: PlayerId, def: string, targetPlayer?: PlayerId, opts: { autoPass?: boolean } = {}): this {
    this.apply({ type: 'play', player: p, card: this.inHand(p, def), targetPlayer });
    if (opts.autoPass !== false) this.passAll();
    return this;
  }

  draw(p: PlayerId): this { return this.apply({ type: 'draw', player: p }); }

  passAll(): this {
    while (this.neighWindow()) {
      const w = this.neighWindow()!;
      this.apply({ type: 'pass', player: w.awaiting[0]! });
    }
    return this;
  }

  neigh(p: PlayerId, def = 'neigh'): this {
    return this.apply({ type: 'neigh', player: p, card: this.inHand(p, def) });
  }

  pass(p: PlayerId): this { return this.apply({ type: 'pass', player: p }); }

  /** answer the current prompt. */
  answer(answer: Answer): this {
    const pr = this.prompt();
    if (!pr) throw new Error('no prompt to answer');
    return this.apply({ type: 'respond', player: pr.player, promptId: pr.id, answer });
  }

  /** answer a chooseCard prompt by def id (first matching option). */
  answerCard(def: string): this {
    const pr = this.prompt();
    if (!pr) throw new Error('no prompt to answer');
    const c = (pr.options as number[]).find((o) => this.state.cards[o]!.def === def);
    if (c === undefined) throw new Error(`${def} is not an option; options: ${this.defs(pr.options as number[]).join(', ')}`);
    return this.answer(c);
  }

  answerCards(defs: string[]): this {
    const pr = this.prompt();
    if (!pr) throw new Error('no prompt to answer');
    const pool = [...(pr.options as number[])];
    const picks = defs.map((d) => {
      const i = pool.findIndex((o) => this.state.cards[o]!.def === d);
      if (i < 0) throw new Error(`${d} is not an option`);
      return pool.splice(i, 1)[0]!;
    });
    return this.answer(picks);
  }

  yes(): this { return this.answer(true); }
  no(): this { return this.answer(false); }
  skip(): this { return this.answer(null); }

  /** answer whatever prompts are pending with the first legal option until input is needed from a player action. */
  autoAnswer(): this {
    for (;;) {
      const w = this.beginWindow();
      if (w) { this.apply({ type: 'beginTurn', player: w.player, card: w.options[0]! }); continue; }
      const pr = this.prompt();
      if (!pr) break;
      const acts = legalActions(this.state, pr.player);
      this.apply(acts[0]!);
    }
    return this;
  }

  /** the beginning-of-turn window, if one is open. */
  beginWindow() {
    const p = this.state.pending;
    return p && p.kind === 'beginTurn' ? p : null;
  }
  /** use one beginning-of-turn card from the open window. */
  useBegin(def: string): this {
    const w = this.beginWindow();
    if (!w) throw new Error('no beginning-of-turn window open');
    const c = w.options.find((x) => this.state.cards[x]!.def === def);
    if (c === undefined) throw new Error(`${def} is not offered; options: ${this.defs(w.options).join(', ')}`);
    return this.apply({ type: 'beginTurn', player: w.player, card: c });
  }
  /** stop using beginning-of-turn cards and draw (mandatory ones still resolve). */
  skipBegin(): this {
    const w = this.beginWindow();
    if (!w) throw new Error('no beginning-of-turn window open');
    return this.apply({ type: 'beginTurn', player: w.player, card: null });
  }

  /** run the turn to the next player's action phase, drawing as the action and auto-discarding. */
  endTurn(): this {
    const t = this.state.turn;
    if (t.phase === 'action' && !this.state.pending && t.playsRemaining > 0) this.draw(t.player);
    this.autoAnswer();
    this.passAll();
    this.autoAnswer();
    return this;
  }
}

export function setup(opts: SetupOptions = {}): Harness {
  return new Harness(opts);
}
