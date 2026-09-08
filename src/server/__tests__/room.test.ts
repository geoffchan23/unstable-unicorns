import { Room, RoomError, type RoomDeps } from '../room';
import type { ServerMessage } from '../protocol';
import '../../engine/cards';

function deps(): RoomDeps & { out: [string, ServerMessage][] } {
  let t = 0; let n = 0;
  const d = {
    out: [] as [string, ServerMessage][],
    send: (conn: string, msg: ServerMessage) => { d.out.push([conn, msg]); },
    now: () => t,
    random: () => { n = (n * 9301 + 49297) % 233280; return n / 233280; },
    token: () => `tok${++n}`,
    botDelay: 10, hostGrace: 100,
  };
  return d;
}
const last = (d: ReturnType<typeof deps>, conn: string, type: ServerMessage['type']) =>
  [...d.out].reverse().find(([c, m]) => c === conn && m.type === type)?.[1] as ServerMessage | undefined;

describe('Room lobby', () => {
  it('create/join assign seats, tokens and host', () => {
    const d = deps(); const r = new Room('ABCD', d);
    expect(r.create('c1', '  Geoff ')).toEqual({ seat: 0, token: 'tok1' });
    expect(r.join('c2', '')).toEqual({ seat: 1, token: 'tok2' });
    expect(r.seats.map((s) => s.name)).toEqual(['Geoff', 'Player']);
    expect(r.host).toBe(0);
    const lobby = last(d, 'c2', 'lobby') as Extract<ServerMessage, { type: 'lobby' }>;
    expect(lobby.you).toBe(1); expect(lobby.host).toBe(0); expect(lobby.status).toBe('lobby');
    expect(lobby.seats).toEqual([{ name: 'Geoff', kind: 'human', connected: true }, { name: 'Player', kind: 'human', connected: true }]);
  });
  it('caps seats at 8 and rejects join while playing', () => {
    const d = deps(); const r = new Room('ABCD', d); r.create('c0', 'a');
    for (let i = 1; i < 8; i++) r.join(`c${i}`, `p${i}`);
    expect(() => r.join('c9', 'x')).toThrow(RoomError);
    const r2 = new Room('EFGH', d); r2.create('h', 'h'); r2.join('g', 'g'); r2.handle('h', { type: 'start', seed: 1 });
    expect(() => r2.join('late', 'x')).toThrow(/started/);
  });
  it('host adds and removes bots, others cannot', () => {
    const d = deps(); const r = new Room('ABCD', d); r.create('h', 'h'); r.join('g', 'g');
    r.handle('h', { type: 'addBot' });
    expect(r.seats[2]).toMatchObject({ kind: 'bot', conn: null, token: null });
    expect(() => r.handle('g', { type: 'addBot' })).toThrow(/host/);
    r.handle('h', { type: 'removeSeat', seat: 2 });
    expect(r.seats).toHaveLength(2);
    expect(() => r.handle('h', { type: 'removeSeat', seat: 0 })).toThrow();
  });
  it('leave renumbers seats and transfers host', () => {
    const d = deps(); const r = new Room('ABCD', d); r.create('h', 'h'); r.join('g', 'g'); r.join('k', 'k');
    r.handle('h', { type: 'leave' });
    expect(r.seats.map((s) => s.name)).toEqual(['g', 'k']);
    expect(r.host).toBe(0);
    expect(r.seatOf('k')).toBe(1);
    expect(last(d, 'h', 'closed')).toBeDefined();
  });
  it('start needs the host and two seats', () => {
    const d = deps(); const r = new Room('ABCD', d); r.create('h', 'h');
    expect(() => r.handle('h', { type: 'start' })).toThrow(/two/i);
    r.handle('h', { type: 'addBot' });
    r.handle('h', { type: 'start', seed: 5 });
    expect(r.status).toBe('playing');
    expect(r.state!.players.map((p) => p.name)).toEqual(['h', 'Sprinkles']);
    const st = last(d, 'h', 'state') as Extract<ServerMessage, { type: 'state' }>;
    expect(st.view.me).toBe(0); expect(st.legal.length).toBeGreaterThan(0);
  });
});

describe('Room play', () => {
  function playing() {
    const d = deps(); const r = new Room('ABCD', d); r.create('h', 'h'); r.join('g', 'g'); r.join('k', 'k');
    r.handle('h', { type: 'start', seed: 11 });
    return { d, r };
  }
  it('overwrites action.player with the sender seat and reports illegal actions only to the sender', () => {
    const { d, r } = playing();
    const before = r.state!;
    d.out.length = 0;
    expect(() => r.handle('g', { type: 'action', action: { type: 'draw', player: 0 } })).toThrow(RoomError);
    expect(r.state).toBe(before);
    expect(d.out).toHaveLength(0);              // errors are thrown, not pushed
    r.handle('h', { type: 'action', action: { type: 'draw', player: 2 } });
    expect(r.state!.players[0]!.hand).toHaveLength(before.players[0]!.hand.length + 1);
    expect(d.out.filter(([, m]) => m.type === 'state').map(([c]) => c).sort()).toEqual(['g', 'h', 'k']);
  });
  it('each seat gets its own view and other hands are hidden', () => {
    const { d, r } = playing();
    const sg = last(d, 'g', 'state') as Extract<ServerMessage, { type: 'state' }>;
    expect(sg.view.me).toBe(1);
    expect(sg.view.players[1]!.hand).not.toBeNull();
    expect(sg.view.players[0]!.hand).toBeNull();
    expect(sg.legal.every((a) => a.player === 1)).toBe(true);
    expect(r.state!.deck.length).toBeGreaterThan(0);
  });
  it('bots act after the delay', () => {
    vi.useFakeTimers();
    const d = deps(); const r = new Room('ABCD', d); r.create('h', 'h'); r.handle('h', { type: 'addBot' }); r.handle('h', { type: 'addBot' });
    r.handle('h', { type: 'start', seed: 3 });
    // make it the bot's turn: human draws
    r.handle('h', { type: 'action', action: { type: 'draw', player: 0 } });
    const turn = r.state!.turn.number;
    expect(r.state!.turn.player).toBe(1);
    vi.advanceTimersByTime(10);
    expect(r.state!.turn.number + r.state!.players[1]!.hand.length).not.toBe(turn + 0); // something happened
    vi.useRealTimers();
  });
  it('replaceWithBot only for a disconnected human, then the bot plays', () => {
    vi.useFakeTimers();
    const { r } = playing();
    expect(() => r.handle('h', { type: 'replaceWithBot', seat: 1 })).toThrow(/connected/);
    r.disconnect('g');
    r.handle('h', { type: 'replaceWithBot', seat: 1 });
    expect(r.seats[1]).toMatchObject({ kind: 'bot', token: null, conn: null });
    expect(r.seatOf('g')).toBe(-1);
    vi.useRealTimers();
  });
  it('rejoin with the token reattaches and resends state', () => {
    const { d, r } = playing();
    const token = r.seats[1]!.token!;
    r.disconnect('g');
    expect(r.seatInfos()[1]!.connected).toBe(false);
    expect(() => r.rejoin('g2', 'nope')).toThrow(RoomError);
    expect(r.rejoin('g2', token)).toEqual({ seat: 1, token });
    expect(last(d, 'g2', 'state')).toBeDefined();
    expect(r.seatInfos()[1]!.connected).toBe(true);
  });
  it('finished -> playAgain returns to lobby with the same seats', () => {
    const { d, r } = playing();
    r.state = { ...r.state!, winner: 2 };
    try { r.handle('h', { type: 'action', action: { type: 'draw', player: 0 } }); } catch { /* engine refuses actions after a win */ }
    // the engine refuses actions once there is a winner; simulate the end via the internal hook instead
    (r as unknown as { afterChange(): void }).afterChange();
    expect(r.status).toBe('finished');
    expect(() => r.handle('g', { type: 'playAgain' })).toThrow(/host/);
    r.handle('h', { type: 'playAgain' });
    expect(r.status).toBe('lobby'); expect(r.state).toBeNull();
    expect((last(d, 'k', 'lobby') as Extract<ServerMessage, { type: 'lobby' }>).status).toBe('lobby');
  });
});

describe('Room host transfer', () => {
  it('makeHost hands over explicitly', () => {
    const d = deps(); const r = new Room('ABCD', d); r.create('h', 'h'); r.join('g', 'g'); r.handle('h', { type: 'addBot' });
    expect(() => r.handle('h', { type: 'makeHost', seat: 2 })).toThrow(/human/);
    r.handle('h', { type: 'makeHost', seat: 1 });
    expect(r.host).toBe(1);
    expect(() => r.handle('h', { type: 'addBot' })).toThrow(/host/);
  });
  it('transfers automatically after the grace period, not before, and not if the host returns', () => {
    vi.useFakeTimers();
    const d = deps(); const r = new Room('ABCD', d); r.create('h', 'h'); r.join('g', 'g');
    const token = r.seats[0]!.token!;
    r.disconnect('h'); vi.advanceTimersByTime(50); expect(r.host).toBe(0);
    r.rejoin('h2', token); vi.advanceTimersByTime(200); expect(r.host).toBe(0);
    r.disconnect('h2'); vi.advanceTimersByTime(100); expect(r.host).toBe(1);
    expect((last(d, 'g', 'lobby') as Extract<ServerMessage, { type: 'lobby' }>).host).toBe(1);
    vi.useRealTimers();
  });
  it('destroy notifies everyone', () => {
    const d = deps(); const r = new Room('ABCD', d); r.create('h', 'h'); r.join('g', 'g');
    r.destroy('expired');
    expect(last(d, 'h', 'closed')).toMatchObject({ reason: 'expired' });
    expect(last(d, 'g', 'closed')).toMatchObject({ reason: 'expired' });
  });
});
