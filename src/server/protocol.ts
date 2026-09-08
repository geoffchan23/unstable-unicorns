import type { Action } from '../engine/types';
import type { PlayerView } from '../engine/view';

export type SeatKind = 'human' | 'bot';
export interface SeatInfo { name: string; kind: SeatKind; connected: boolean }
export type RoomStatus = 'lobby' | 'playing' | 'finished';

export type ClientMessage =
  | { type: 'create'; name: string; passphrase: string }
  | { type: 'join'; code: string; name: string }
  | { type: 'rejoin'; code: string; token: string }
  | { type: 'addBot' }
  | { type: 'removeSeat'; seat: number }
  | { type: 'start'; seed?: number }
  | { type: 'action'; action: Action }
  | { type: 'replaceWithBot'; seat: number }
  | { type: 'playAgain' }
  | { type: 'makeHost'; seat: number }
  | { type: 'leave' };

export type ServerMessage =
  | { type: 'joined'; code: string; seat: number; token: string }
  | { type: 'lobby'; code: string; seats: SeatInfo[]; you: number; host: number; status: RoomStatus }
  | { type: 'state'; view: PlayerView; legal: Action[]; seats: SeatInfo[]; host: number }
  | { type: 'error'; message: string; code?: 'NO_ROOM' | 'BAD_TOKEN' | 'FULL' | 'PASSPHRASE' | 'RATE' }
  | { type: 'closed'; reason: string };

export const MAX_SEATS = 8;
export const BOT_DELAY_MS = 650;
export const HOST_GRACE_MS = 20_000;
