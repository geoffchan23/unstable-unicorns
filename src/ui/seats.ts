export type SeatKind = 'human' | 'bot';
export interface SeatInfo { name: string; kind: SeatKind; connected: boolean }
export type Seat = { name: string; kind: SeatKind };   // local setup
