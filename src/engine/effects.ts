import type {
  Answer, EffectHandlerName, GameState, InstanceId, PendingEffect, PlayerId, Prompt, RemovalEvent, RemovalKind,
} from './types';
import { shuffleInPlace, randomInt } from './rng';
import { cloneState } from './clone';
import {
  dataOf, defOf, effectsActive, isUnicornType, nameOf, others, playersFrom, stableOwner,
  typeOf, unicornCount, vetoEntry, zoneOf, isUnicornCardInStable, isPanda,
} from './queries';

/** Thrown by ctx.choose when the effect needs an answer it does not have yet. */
export class NeedInput {
  constructor(public prompt: Prompt) {}
}

/** Thrown by checkWin: the game ended mid-effect; whatever is left of the effect is moot. */
export class GameWon {
  constructor(public winner: PlayerId) {}
}

export type EnterReason = 'play' | 'steal' | 'move' | 'bring';

export class Ctx {
  private cursor = 0;

  constructor(public state: GameState, public effect: PendingEffect) {}

  // ---------- identity ----------

  get self(): InstanceId {
    if (this.effect.kind !== 'card') throw new Error('builtin effect has no self');
    return this.effect.card;
  }

  get controller(): PlayerId {
    return this.effect.kind === 'card' ? this.effect.controller : this.effect.player;
  }

  get payload(): Record<string, unknown> {
    return this.effect.kind === 'card' ? this.effect.payload ?? {} : {};
  }

  // ---------- prompts ----------

  private ask(p: Omit<Prompt, 'id'>): Answer {
    const answers = this.effect.answers;
    if (this.cursor < answers.length) return answers[this.cursor++]!;
    throw new NeedInput({ id: this.state.nextPromptId, ...p });
  }

  private source(): InstanceId | undefined {
    return this.effect.kind === 'card' ? this.effect.card : undefined;
  }

  chooseCard(
    player: PlayerId, options: InstanceId[], message: string, opts: { optional?: boolean } = {},
  ): InstanceId | null {
    if (options.length === 0) return null;
    const a = this.ask({
      player, kind: 'chooseCard', message, options, optional: !!opts.optional, source: this.source(),
    });
    if (a === null) return null;
    return a as InstanceId;
  }

  chooseCards(player: PlayerId, options: InstanceId[], count: number, message: string): InstanceId[] {
    const n = Math.min(count, options.length);
    if (n === 0) return [];
    if (n === options.length) return [...options];
    const a = this.ask({
      player, kind: 'chooseCard', message, options, optional: false, count: n, source: this.source(),
    });
    return a as InstanceId[];
  }

  choosePlayer(player: PlayerId, options: PlayerId[], message: string, optional = false): PlayerId | null {
    if (options.length === 0) return null;
    if (options.length === 1 && !optional) return options[0]!;
    const a = this.ask({ player, kind: 'choosePlayer', message, options, optional, source: this.source() });
    return a === null ? null : (a as PlayerId);
  }

  confirm(player: PlayerId, message: string): boolean {
    const a = this.ask({
      player, kind: 'confirm', message, options: ['yes', 'no'], optional: false, source: this.source(),
    });
    return a === true || a === 'yes';
  }

  chooseOption(player: PlayerId, options: string[], message: string): string {
    if (options.length === 1) return options[0]!;
    const a = this.ask({ player, kind: 'chooseOption', message, options, optional: false, source: this.source() });
    return a as string;
  }

  // ---------- logging ----------

  log(text: string): void {
    this.state.log.push({ turn: this.state.turn.number, text });
  }

  name(card: InstanceId): string {
    return nameOf(this.state, card);
  }

  playerName(p: PlayerId): string {
    return this.state.players[p]!.name;
  }

  // ---------- queue ----------

  enqueue(effect: PendingEffect, front = false): void {
    if (front) this.state.effectQueue.unshift(effect);
    else this.state.effectQueue.push(effect);
  }

  private enqueueCard(
    card: InstanceId, handler: EffectHandlerName,
    controller: PlayerId, payload?: Record<string, unknown>, front = false,
  ): void {
    this.enqueue({ kind: 'card', card, handler, controller, answers: [], payload }, front);
  }

  // ---------- zones ----------

  private pluck(card: InstanceId): void {
    const s = this.state;
    for (const p of s.players) {
      let i = p.hand.indexOf(card);
      if (i >= 0) { p.hand.splice(i, 1); return; }
      i = p.stable.indexOf(card);
      if (i >= 0) { p.stable.splice(i, 1); return; }
    }
    for (const zone of [s.deck, s.discard, s.nursery, s.limbo]) {
      const i = zone.indexOf(card);
      if (i >= 0) { zone.splice(i, 1); return; }
    }
    throw new Error(`pluck: card ${card} not found`);
  }

  hand(player: PlayerId): InstanceId[] {
    return this.state.players[player]!.hand;
  }

  stable(player: PlayerId): InstanceId[] {
    return this.state.players[player]!.stable;
  }

  others(player: PlayerId = this.controller): PlayerId[] {
    return others(this.state, player);
  }

  allPlayers(): PlayerId[] {
    return playersFrom(this.state, this.controller);
  }

  // ---------- selectors ----------

  /** Unicorn cards (not Pandas) in the given players' stables. */
  unicornsIn(players: PlayerId[]): InstanceId[] {
    return players.flatMap((p) => this.stable(p).filter((c) => isUnicornCardInStable(this.state, c)));
  }

  /** every Unicorn-type card, Pandas included, in these stables. */
  unicornTypesIn(players: PlayerId[]): InstanceId[] {
    return players.flatMap((p) => this.stable(p).filter((c) => isUnicornType(typeOf(this.state, c))));
  }

  stableCardsIn(players: PlayerId[]): InstanceId[] {
    return players.flatMap((p) => [...this.stable(p)]);
  }

  ofType(players: PlayerId[], type: 'upgrade' | 'downgrade' | 'basic_unicorn'): InstanceId[] {
    return players.flatMap((p) => this.stable(p).filter((c) => typeOf(this.state, c) === type));
  }

  handOfType(player: PlayerId, pred: (card: InstanceId) => boolean): InstanceId[] {
    return this.hand(player).filter(pred);
  }

  discardOfType(pred: (card: InstanceId) => boolean): InstanceId[] {
    return this.state.discard.filter(pred);
  }

  type(card: InstanceId) {
    return typeOf(this.state, card);
  }

  isUnicorn(card: InstanceId): boolean {
    return isUnicornType(typeOf(this.state, card));
  }

  isBasic(card: InstanceId): boolean {
    return typeOf(this.state, card) === 'basic_unicorn';
  }

  isMagic(card: InstanceId): boolean {
    return typeOf(this.state, card) === 'magic';
  }

  isNeigh(card: InstanceId): boolean {
    return typeOf(this.state, card) === 'instant';
  }

  hasNameContaining(card: InstanceId, s: string): boolean {
    return nameOf(this.state, card).toLowerCase().includes(s.toLowerCase());
  }

  owner(card: InstanceId): PlayerId | null {
    return stableOwner(this.state, card);
  }

  /** can this card legally enter this player's stable (Queen Bee)? */
  canEnter(card: InstanceId, into: PlayerId): boolean {
    return vetoEntry(this.state, card, into) === null;
  }

  unicornCount(player: PlayerId): number {
    return unicornCount(this.state, player);
  }

  // ---------- primitives ----------

  draw(player: PlayerId, n = 1): InstanceId[] {
    const drawn: InstanceId[] = [];
    for (let i = 0; i < n; i++) {
      if (this.state.deck.length === 0) this.reshuffleDiscardIntoDeck();
      const c = this.state.deck.pop();
      if (c === undefined) break;
      this.state.players[player]!.hand.push(c);
      drawn.push(c);
    }
    if (drawn.length) this.log(`${this.playerName(player)} draws ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`);
    return drawn;
  }

  reshuffleDiscardIntoDeck(): void {
    if (this.state.discard.length === 0) return;
    this.state.deck.push(...this.state.discard);
    this.state.discard = [];
    shuffleInPlace(this.state, this.state.deck);
    this.log('The discard pile is shuffled into the deck.');
  }

  shuffleDeck(): void {
    shuffleInPlace(this.state, this.state.deck);
  }

  /** move a specific card from a hand to the discard pile. */
  discardCard(player: PlayerId, card: InstanceId): void {
    const i = this.hand(player).indexOf(card);
    if (i < 0) throw new Error('discardCard: not in hand');
    this.hand(player).splice(i, 1);
    this.state.discard.push(card);
    this.log(`${this.playerName(player)} discards ${this.name(card)}.`);
  }

  /** player chooses and discards up to n cards (as many as they hold). Returns the count. */
  discardChoose(player: PlayerId, n: number, message = 'Choose a card to DISCARD'): number {
    let done = 0;
    for (let i = 0; i < n; i++) {
      const hand = this.hand(player);
      if (hand.length === 0) break;
      const c = this.chooseCard(player, [...hand], message)!;
      this.discardCard(player, c);
      done++;
    }
    return done;
  }

  /** a random card from a hand (Americorn). */
  randomFromHand(player: PlayerId): InstanceId | null {
    const hand = this.hand(player);
    if (hand.length === 0) return null;
    return hand[randomInt(this.state, hand.length)]!;
  }

  addToHand(card: InstanceId, player: PlayerId): void {
    this.pluck(card);
    this.hand(player).push(card);
  }

  toDiscard(card: InstanceId): void {
    this.pluck(card);
    this.state.discard.push(card);
  }

  toDeckTop(card: InstanceId): void {
    this.pluck(card);
    this.state.deck.push(card);
  }

  toNursery(card: InstanceId): void {
    this.pluck(card);
    this.state.nursery.push(card);
  }

  /** search the deck for a card matching pred; player picks one; it goes to hand; deck shuffled. */
  searchDeck(player: PlayerId, pred: (c: InstanceId) => boolean, message: string): InstanceId | null {
    const options = this.state.deck.filter(pred);
    const pick = this.chooseCard(player, options, message, { optional: true });
    if (pick !== null) {
      this.addToHand(pick, player);
      this.log(`${this.playerName(player)} takes ${this.name(pick)} from the deck.`);
    }
    this.shuffleDeck();
    return pick;
  }

  // ---------- stable entry ----------

  /**
   * Put a card into a stable from wherever it is. Fires enter triggers.
   * Returns false if a global veto (Queen Bee) blocks it.
   */
  enterStable(card: InstanceId, player: PlayerId, reason: EnterReason): boolean {
    const veto = vetoEntry(this.state, card, player);
    if (veto) {
      this.log(`${this.name(card)} cannot enter ${this.playerName(player)}'s stable: ${veto}`);
      return false;
    }
    const from = zoneOf(this.state, card);
    const fromOwner = from.zone === 'stable' ? from.player : null;
    if (fromOwner !== null && fromOwner !== player) {
      // leaving the old stable (steal/move)
      this.fireLeaveTriggers(card, fromOwner, false);
    }
    this.pluck(card);
    this.stable(player).push(card);
    const verb = reason === 'steal' ? 'steals' : reason === 'play' ? 'plays' : 'brings';
    this.log(`${this.playerName(player)} ${verb} ${this.name(card)} into their stable.`);

    // the card's own on-enter trigger
    const def = defOf(this.state, card);
    if (def.onEnter && effectsActive(this.state, card)) {
      this.enqueueCard(card, 'onEnter', player);
    }
    this.fireStableChanged(card, player, 'entered');
    checkWin(this.state);
    return true;
  }

  steal(card: InstanceId, to: PlayerId = this.controller): boolean {
    return this.enterStable(card, to, 'steal');
  }

  private fireStableChanged(card: InstanceId, player: PlayerId, what: 'entered' | 'left'): void {
    const isUni = this.isUnicorn(card);
    for (const c of [...this.stable(player)]) {
      if (c === card) continue;
      const d = defOf(this.state, c);
      if (!effectsActive(this.state, c)) continue;
      if (isUni && what === 'entered' && d.onUnicornEntered) this.enqueueCard(c, 'onUnicornEntered', player, { unicorn: card });
      if (isUni && what === 'left' && d.onUnicornLeft) this.enqueueCard(c, 'onUnicornLeft', player, { unicorn: card });
      if (d.onStableChanged) this.enqueueCard(c, 'onStableChanged', player, undefined, true);
    }
  }

  private fireLeaveTriggers(card: InstanceId, owner: PlayerId, realRemoval: boolean): void {
    if (realRemoval) {
      const def = defOf(this.state, card);
      if (def.onLeave && effectsActive(this.state, card)) this.enqueueCard(card, 'onLeave', owner);
    }
    this.fireStableChanged(card, owner, 'left');
  }

  // ---------- removal pipeline ----------

  /**
   * Try to remove a card from a stable. Consults immunities and replacement effects.
   * Returns true only if the card really went to the discard pile.
   */
  remove(kind: RemovalKind, card: InstanceId, opts: { byMagic?: boolean; actor?: PlayerId } = {}): boolean {
    const owner = stableOwner(this.state, card);
    if (owner === null) return false;
    const ev: RemovalEvent = {
      kind, card, owner, source: this.source(), byMagic: !!opts.byMagic, actor: opts.actor ?? this.controller,
    };
    const selfDef = defOf(this.state, card);
    const selfActive = effectsActive(this.state, card) || typeOf(this.state, card) === 'baby_unicorn';

    // 1. immunities (pure)
    if (selfActive && selfDef.immuneTo?.(this.state, ev)) {
      this.log(`${this.name(card)} cannot be ${verbOf(kind)}.`);
      return false;
    }
    for (const c of this.stable(owner)) {
      if (c === card) continue;
      const d = defOf(this.state, c);
      if (d.protectsOthers && effectsActive(this.state, c) && d.protectsOthers(this.state, ev)) {
        this.log(`${this.name(card)} is protected by ${this.name(c)}.`);
        return false;
      }
    }
    // 2. saves by other cards (Black Knight), each asked once
    for (const c of [...this.stable(owner)]) {
      if (c === card || !this.stable(owner).includes(c)) continue;
      const d = defOf(this.state, c);
      if (d.protectOther && effectsActive(this.state, c) && d.protectOther(this, ev, c)) return false;
    }
    // 3. self replacement (Phoenix, Flyers, Baby Unicorn)
    if (selfActive && selfDef.replaceRemoval?.(this, ev)) return false;

    // 4. the removal itself
    this.fireLeaveTriggers(card, owner, kind !== 'returnToHand');
    this.pluck(card);
    this.state.discard.push(card);
    this.log(`${this.name(card)} is ${verbOf(kind)}.`);
    checkWin(this.state);
    return true;
  }

  destroy(card: InstanceId, opts: { byMagic?: boolean } = {}): boolean {
    return this.remove('destroy', card, opts);
  }

  sacrifice(card: InstanceId, opts: { byMagic?: boolean } = {}): boolean {
    return this.remove('sacrifice', card, opts);
  }

  /** used by replacement effects: card leaves the stable to a destination other than discard. */
  leaveStableTo(card: InstanceId, dest: 'hand' | 'nursery', owner: PlayerId): void {
    this.fireLeaveTriggers(card, owner, false);
    this.pluck(card);
    if (dest === 'hand') {
      this.hand(owner).push(card);
      this.log(`${this.name(card)} returns to ${this.playerName(owner)}'s hand.`);
    } else {
      this.state.nursery.push(card);
      this.log(`${this.name(card)} returns to the Nursery.`);
    }
    checkWin(this.state);
  }

  /** "Return a card in a stable to its owner's hand." Baby Unicorns go to the Nursery. */
  returnToHand(card: InstanceId, opts: { byMagic?: boolean } = {}): boolean {
    const owner = stableOwner(this.state, card);
    if (owner === null) return false;
    const ev: RemovalEvent = {
      kind: 'returnToHand', card, owner, source: this.source(), byMagic: !!opts.byMagic, actor: this.controller,
    };
    const def = defOf(this.state, card);
    if (def.immuneTo?.(this.state, ev)) { this.log(`${this.name(card)} cannot be returned.`); return false; }
    if (def.replaceRemoval?.(this, ev)) return false;
    this.leaveStableTo(card, 'hand', owner);
    return true;
  }

  /** move an Upgrade/Downgrade between stables (Re-Target). */
  moveBetweenStables(card: InstanceId, to: PlayerId): boolean {
    return this.enterStable(card, to, 'move');
  }

  // ---------- turn control ----------

  endTurn(): void {
    // drop any remaining beginning-of-turn effects for this player
    this.state.effectQueue = this.state.effectQueue.filter(
      (e) => !(e.kind === 'card' && e.handler === 'onBeginTurn' && e.controller === this.controller),
    );
    this.state.turn.phase = 'end';
    this.log(`${this.playerName(this.controller)}'s turn ends immediately.`);
  }

  extraTurn(): void {
    this.state.turn.extraTurns++;
  }

  isPanda(card: InstanceId): boolean {
    return isPanda(this.state, card);
  }

  data(card: InstanceId) {
    return dataOf(this.state, card);
  }
}

function verbOf(kind: RemovalKind): string {
  return kind === 'destroy' ? 'destroyed' : kind === 'sacrifice' ? 'sacrificed' : 'returned';
}

export function checkWin(state: GameState): void {
  if (state.winner !== null) return;
  for (const p of playersFrom(state, state.turn.player)) {
    if (unicornCount(state, p) >= state.unicornsToWin) {
      state.winner = p;
      state.log.push({ turn: state.turn.number, text: `${state.players[p]!.name} wins with ${unicornCount(state, p)} Unicorns!` });
      throw new GameWon(p);
    }
  }
}

/** Built-in (non-card) effects that use the same prompt machinery. */
export const builtins: Record<'endTurnDiscard' | 'discardLimbo' | 'system', (ctx: Ctx) => void> = {
  endTurnDiscard(ctx) {
    const p = ctx.controller;
    while (ctx.hand(p).length > 7) {
      const c = ctx.chooseCard(p, [...ctx.hand(p)], 'Discard down to 7 cards')!;
      ctx.discardCard(p, c);
    }
  },
  discardLimbo(ctx) {
    const e = ctx.effect;
    if (e.kind === 'builtin' && e.card !== undefined && ctx.state.limbo.includes(e.card)) ctx.toDiscard(e.card);
  },
  system() {},
};

/** a context for engine-internal use of the primitives (no prompts allowed). */
export function systemCtx(state: GameState, player: PlayerId): Ctx {
  return new Ctx(state, { kind: 'builtin', name: 'system', player, answers: [] });
}

export type RunResult = { done: true; state: GameState } | { done: false; prompt: Prompt; preview: GameState };

/** Run the effect at the head of the queue against a snapshot. */
export function runEffect(state: GameState, effect: PendingEffect): RunResult {
  const snap = cloneState(state);
  const ctx = new Ctx(snap, snapEffect(snap, effect));
  try {
    if (effect.kind === 'builtin') {
      builtins[effect.name](ctx);
    } else {
      const def = defOf(snap, effect.card);
      const handler = def[effect.handler];
      if (handler && shouldRun(snap, effect)) handler.call(def, ctx);
    }
  } catch (e) {
    if (e instanceof NeedInput) return { done: false, prompt: e.prompt, preview: snap };
    if (!(e instanceof GameWon)) throw e;
    // game over: commit what happened so far
  }
  // remove the completed effect by identity: handlers may have inserted effects in front of it
  const i = snap.effectQueue.indexOf(ctx.effect);
  if (i >= 0) snap.effectQueue.splice(i, 1);
  return { done: true, state: snap };
}

function snapEffect(snap: GameState, _effect: PendingEffect): PendingEffect {
  // the head of the snapshot's queue is the same effect (by construction)
  const head = snap.effectQueue[0];
  if (!head) throw new Error('runEffect: queue empty in snapshot');
  return head;
}

/** trigger-specific preconditions checked when the effect actually runs. */
function shouldRun(state: GameState, effect: PendingEffect & { kind: 'card' }): boolean {
  const inStable = stableOwner(state, effect.card) === effect.controller;
  switch (effect.handler) {
    case 'onEnter':
    case 'onBeginTurn':
      return inStable && effectsActive(state, effect.card);
    case 'onUnicornEntered':
    case 'onUnicornLeft':
    case 'onStableChanged':
      return inStable && effectsActive(state, effect.card);
    case 'onLeave':
      return true;
    case 'onPlayMagic':
      return state.limbo.includes(effect.card);
  }
}
