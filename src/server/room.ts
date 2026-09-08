import { applyAction, createGame, legalActions, IllegalAction } from '../engine/game';
import { viewFor } from '../engine/view';
import { greedyBotAction, playersToAct } from '../engine/bot';
import type { Action, GameState } from '../engine/types';
import { BOT_DELAY_MS, HOST_GRACE_MS, MAX_SEATS, type ClientMessage, type RoomStatus, type SeatInfo, type SeatKind, type ServerMessage } from './protocol';

export class RoomError extends Error {
  constructor(message: string, public code?: Extract<ServerMessage, { type: 'error' }>['code']) { super(message); }
}
export interface RoomDeps {
  send(conn: string, msg: ServerMessage): void;
  now(): number; random(): number; token(): string;
  botDelay?: number; hostGrace?: number;
}
export interface Seat { name: string; kind: SeatKind; token: string | null; conn: string | null }

const BOT_NAMES = ['Sprinkles', 'Glitterhoof', 'Stabbington', 'Nimbus', 'Marshmallow', 'Twinkle', 'Rhubarb'];
const cleanName = (n: string) => (n ?? '').toString().trim().slice(0, 20) || 'Player';

export class Room {
  status: RoomStatus = 'lobby';
  seats: Seat[] = [];
  host = 0;
  state: GameState | null = null;
  lastActivity: number;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private hostTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly code: string, private deps: RoomDeps) { this.lastActivity = deps.now(); }

  // ---- connections
  create(conn: string, name: string) { return this.addHuman(conn, name); }
  join(conn: string, name: string) {
    if (this.status !== 'lobby') throw new RoomError('That game has already started');
    if (this.seats.length >= MAX_SEATS) throw new RoomError('That room is full', 'FULL');
    return this.addHuman(conn, name);
  }
  private addHuman(conn: string, name: string) {
    const token = this.deps.token();
    this.seats.push({ name: cleanName(name), kind: 'human', token, conn });
    this.touch(); this.pushLobby();
    return { seat: this.seats.length - 1, token };
  }
  rejoin(conn: string, token: string) {
    const seat = this.seats.findIndex((s) => s.kind === 'human' && s.token === token);
    if (seat < 0) throw new RoomError('That seat is gone', 'BAD_TOKEN');
    this.seats[seat]!.conn = conn;
    if (seat === this.host && this.hostTimer) { clearTimeout(this.hostTimer); this.hostTimer = null; }
    this.touch(); this.pushLobby();
    if (this.status !== 'lobby') this.pushState(seat);
    return { seat, token };
  }
  disconnect(conn: string) {
    const seat = this.seatOf(conn);
    if (seat < 0) return;
    this.seats[seat]!.conn = null;
    if (seat === this.host) this.armHostTransfer();
    this.pushLobby();
  }
  seatOf(conn: string) { return this.seats.findIndex((s) => s.conn === conn); }
  connectedHumans() { return this.seats.filter((s) => s.kind === 'human' && s.conn !== null).length; }
  humanSeats() { return this.seats.filter((s) => s.kind === 'human').length; }
  seatInfos(): SeatInfo[] { return this.seats.map((s) => ({ name: s.name, kind: s.kind, connected: s.kind === 'human' && s.conn !== null })); }

  // ---- messages
  handle(conn: string, msg: ClientMessage) {
    const seat = this.seatOf(conn);
    if (seat < 0) throw new RoomError('You are not in this room');
    this.touch();
    const host = () => { if (seat !== this.host) throw new RoomError('Only the host can do that'); };
    const lobby = () => { if (this.status !== 'lobby') throw new RoomError('Not in the lobby'); };
    switch (msg.type) {
      case 'addBot': host(); lobby();
        if (this.seats.length >= MAX_SEATS) throw new RoomError('That room is full', 'FULL');
        this.seats.push({ name: BOT_NAMES[this.seats.filter((s) => s.kind === 'bot').length % BOT_NAMES.length]!, kind: 'bot', token: null, conn: null });
        this.pushLobby(); return;
      case 'removeSeat': host(); lobby();
        if (msg.seat === this.host || !this.seats[msg.seat]) throw new RoomError('Cannot remove that seat');
        this.removeSeat(msg.seat); return;
      case 'leave': lobby(); this.removeSeat(seat); return;
      case 'start': host(); lobby();
        if (this.seats.length < 2) throw new RoomError('You need at least two players');
        this.state = createGame({ players: this.seats.map((s) => s.name), seed: msg.seed ?? Math.floor(this.deps.random() * 2 ** 31) });
        this.status = 'playing'; this.pushLobby(); this.afterChange(); return;
      case 'action': {
        if (this.status !== 'playing' || !this.state) throw new RoomError('No game in progress');
        const action = { ...msg.action, player: seat } as Action;
        try { this.state = applyAction(this.state, action); }
        catch (e) { if (e instanceof IllegalAction) throw new RoomError(e.message); throw e; }
        this.afterChange(); return;
      }
      case 'replaceWithBot': { host();
        const s = this.seats[msg.seat];
        if (this.status !== 'playing' || !s || s.kind !== 'human' || s.conn !== null) throw new RoomError('Only a disconnected player can be replaced');
        if (msg.seat === this.host) throw new RoomError('The host cannot be replaced');
        s.kind = 'bot'; s.token = null; s.conn = null;
        this.pushLobby(); this.afterChange(); return;
      }
      case 'makeHost': { host();
        const s = this.seats[msg.seat];
        if (!s || s.kind !== 'human') throw new RoomError('The host must be a human player');
        this.setHost(msg.seat); return;
      }
      case 'playAgain': host();
        if (this.status !== 'finished') throw new RoomError('The game is not over');
        this.state = null; this.status = 'lobby'; this.clearBot(); this.pushLobby(); return;
      default: throw new RoomError('Unknown message');
    }
  }

  // ---- internals
  private removeSeat(seat: number) {
    const s = this.seats[seat]!;
    if (seat === this.host) { const next = this.nextHost(seat); if (next >= 0) this.host = next; }
    this.seats.splice(seat, 1);
    if (this.host > seat) this.host -= 1;
    if (s.conn) this.deps.send(s.conn, { type: 'closed', reason: 'left' });
    this.pushLobby();
  }
  private nextHost(except: number) {
    return this.seats.findIndex((s, i) => i !== except && s.kind === 'human' && s.conn !== null);
  }
  private setHost(seat: number) {
    this.host = seat;
    if (this.hostTimer) { clearTimeout(this.hostTimer); this.hostTimer = null; }
    this.pushLobby(); if (this.status === 'playing') this.pushStateAll();
  }
  private armHostTransfer() {
    if (this.hostTimer) return;
    this.hostTimer = setTimeout(() => {
      this.hostTimer = null;
      const next = this.nextHost(this.host);
      if (next >= 0) this.setHost(next);
      else this.armHostTransfer();   // nobody here; try again later
    }, this.deps.hostGrace ?? HOST_GRACE_MS);
  }
  /** After any game-state change: winner check, broadcast, bot scheduling. */
  afterChange() {
    const st = this.state;
    if (!st) return;
    this.clearBot();
    if (st.winner !== null && this.status === 'playing') { this.status = 'finished'; this.pushLobby(); }
    this.pushStateAll();
    if (this.status !== 'playing') return;
    const bot = playersToAct(st).find((p) => this.seats[p]?.kind === 'bot');
    if (bot === undefined) return;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      if (this.status !== 'playing' || !this.state) return;
      const a = greedyBotAction(this.state, bot, this.deps.random);
      if (a) { this.state = applyAction(this.state, a); this.afterChange(); }
    }, this.deps.botDelay ?? BOT_DELAY_MS);
  }
  private clearBot() { if (this.botTimer) { clearTimeout(this.botTimer); this.botTimer = null; } }
  private touch() { this.lastActivity = this.deps.now(); }
  private pushLobby() {
    const seats = this.seatInfos();
    this.seats.forEach((s, i) => { if (s.conn) this.deps.send(s.conn, { type: 'lobby', code: this.code, seats, you: i, host: this.host, status: this.status }); });
  }
  private pushStateAll() { this.seats.forEach((_, i) => this.pushState(i)); }
  private pushState(seat: number) {
    const s = this.seats[seat]; const st = this.state;
    if (!s?.conn || !st) return;
    this.deps.send(s.conn, { type: 'state', view: viewFor(st, seat), legal: legalActions(st, seat), seats: this.seatInfos(), host: this.host });
  }
  destroy(reason: string) {
    this.clearBot(); if (this.hostTimer) clearTimeout(this.hostTimer);
    for (const s of this.seats) if (s.conn) this.deps.send(s.conn, { type: 'closed', reason });
    this.seats = []; this.state = null;
  }
}
