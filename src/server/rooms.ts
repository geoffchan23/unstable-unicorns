import { Room, RoomError, type RoomDeps } from './room';

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export function generateCode(random: () => number) {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return s;
}

export class RoomRegistry {
  rooms = new Map<string, Room>();
  private max: number;
  private idleMs: number;
  private emptyMs: number;

  constructor(private deps: RoomDeps, opts: { max?: number; idleMs?: number; emptyMs?: number } = {}) {
    this.max = opts.max ?? 50;
    this.idleMs = opts.idleMs ?? 2 * 60 * 60_000;
    this.emptyMs = opts.emptyMs ?? 10 * 60_000;
  }

  create(): Room {
    if (this.rooms.size >= this.max) throw new RoomError('Too many games right now, try again later');
    let code = generateCode(this.deps.random);
    while (this.rooms.has(code)) code = generateCode(this.deps.random);
    const room = new Room(code, this.deps);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string) { return this.rooms.get((code ?? '').toUpperCase()); }

  remove(code: string) {
    const key = (code ?? '').toUpperCase();
    const r = this.rooms.get(key);
    if (r) { r.destroy('closed'); this.rooms.delete(key); }
  }

  /**
   * Removes rooms that are idle for more than `idleMs` since their last activity, that have had
   * zero connected humans for more than `emptyMs` (measured from that same last-activity mark,
   * since disconnects don't themselves touch it), or that have zero human seats at all.
   */
  sweep(now: number): string[] {
    const gone: string[] = [];
    for (const [code, r] of this.rooms) {
      const inactiveFor = now - r.lastActivity;
      const remove = r.humanSeats() === 0
        || (r.connectedHumans() === 0 && inactiveFor > this.emptyMs)
        || inactiveFor > this.idleMs;
      if (remove) {
        r.destroy('expired');
        this.rooms.delete(code);
        gone.push(code);
      }
    }
    return gone;
  }
}
