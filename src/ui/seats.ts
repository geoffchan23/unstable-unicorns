export type SeatKind = 'human' | 'bot';
export interface SeatInfo { name: string; kind: SeatKind; connected: boolean; avatar?: string }
export type Seat = { name: string; kind: SeatKind; avatar?: string };   // local setup
