import WebSocket from 'ws';
import { startServer } from '../server';
import type { ClientMessage, ServerMessage } from '../protocol';
import '../../engine/cards';

class Client {
  ws: WebSocket; inbox: ServerMessage[] = []; waiters: ((m: ServerMessage) => void)[] = [];
  constructor(port: number, origin = 'http://localhost:5173') {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { origin } });
    this.ws.on('message', (d) => { const m = JSON.parse(d.toString()) as ServerMessage; this.inbox.push(m); this.waiters.splice(0).forEach((w) => w(m)); });
  }
  open() { return new Promise<void>((res, rej) => { this.ws.once('open', res); this.ws.once('error', rej); }); }
  send(m: ClientMessage) { this.ws.send(JSON.stringify(m)); }
  next<T extends ServerMessage['type']>(type: T): Promise<Extract<ServerMessage, { type: T }>> {
    const found = this.inbox.find((m) => m.type === type);
    if (found) { this.inbox.splice(this.inbox.indexOf(found), 1); return Promise.resolve(found as never); }
    return new Promise((res) => { const w = (m: ServerMessage) => { if (m.type === type) { this.inbox.splice(this.inbox.indexOf(m), 1); res(m as never); } else this.waiters.push(w); }; this.waiters.push(w); });
  }
  last<T extends ServerMessage['type']>(type: T) { return [...this.inbox].reverse().find((m) => m.type === type) as Extract<ServerMessage, { type: T }> | undefined; }
}

describe('ws server', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  // Generous message-throttle limits here: this server backs most of the suite below, including
  // a whole-game correctness test that legitimately fires many `action` messages back-to-back
  // (each awaited round trip on localhost easily beats the production default of 20/s burst 40).
  // The throttle itself is exercised against its own dedicated, tightly-limited server instance.
  beforeAll(async () => { srv = await startServer({ port: 0, allowedOrigins: ['http://localhost:5173'], dev: true, limits: { msgPerSec: 10_000, burst: 10_000 } }); });
  afterAll(() => srv.close());

  it('rejects bad origins', async () => {
    const c = new Client(srv.port, 'https://evil.example');
    await expect(c.open()).rejects.toBeTruthy();
  });
  it('healthz responds', async () => {
    const r = await fetch(`http://127.0.0.1:${srv.port}/healthz`);
    expect(await r.text()).toBe('ok');
  });
  it('anyone allowed to connect may create a room; two clients play a whole game', async () => {
    const a = new Client(srv.port); const b = new Client(srv.port);
    await a.open(); await b.open();
    a.send({ type: 'create', name: 'A' });
    const joined = await a.next('joined');
    b.send({ type: 'join', code: joined.code.toLowerCase(), name: 'B' });
    const jb = await b.next('joined'); expect(jb.seat).toBe(1);
    b.send({ type: 'start' }); expect((await b.next('error')).message).toMatch(/host/);
    a.send({ type: 'start', seed: 99 });
    const clients = [a, b];
    let winner: number | null = null;
    for (let i = 0; i < 2000 && winner === null; i++) {
      for (const c of clients) {
        // Keep acting for this client while it's still their turn (e.g. a played card can
        // chain into a follow-up prompt for the same player) so we never move on and strand
        // an already-buffered `state` message unread.
        let st = c.last('state');
        while (st && st.view.winner === null && st.legal.length) {
          const act = st.legal[Math.floor(Math.random() * st.legal.length)]!;
          c.inbox = c.inbox.filter((m) => m.type !== 'state');
          c.send({ type: 'action', action: act });
          st = await c.next('state');
        }
        if (st?.view.winner !== null && st?.view.winner !== undefined) { winner = st.view.winner; break; }
      }
      if (![a, b].some((c) => c.last('state')?.legal.length)) await new Promise((r) => setTimeout(r, 20));
    }
    expect(winner).not.toBeNull();
    expect(a.last('lobby')?.status ?? (await a.next('lobby')).status).toBe('finished');
    a.ws.close(); b.ws.close();
  }, 60_000);
  it('rejoin with a token after the socket drops', async () => {
    const a = new Client(srv.port); await a.open();
    a.send({ type: 'create', name: 'A' });
    const j = await a.next('joined');
    a.ws.close();
    const a2 = new Client(srv.port); await a2.open();
    a2.send({ type: 'rejoin', code: j.code, token: j.token });
    expect((await a2.next('joined')).seat).toBe(0);
    a2.send({ type: 'rejoin', code: 'ZZZZ', token: 'x' });
    expect((await a2.next('error')).code).toBe('NO_ROOM');
    a2.ws.close();
  });
  it('rate-limits room creation per IP', async () => {
    const s2 = await startServer({ port: 0, allowedOrigins: ['http://localhost:5173'], dev: false });
    const c = new Client(s2.port); await c.open();
    c.send({ type: 'create', name: 'A' }); await c.next('joined');
    c.send({ type: 'leave' });
    c.send({ type: 'create', name: 'A' });
    expect((await c.next('error')).code).toBe('RATE');
    c.ws.close(); await s2.close();
  });
  it('rejoining a different room disconnects the socket from its old room first', async () => {
    const a = new Client(srv.port); const b = new Client(srv.port);
    await a.open(); await b.open();
    a.send({ type: 'create', name: 'A' });
    const joinedA = await a.next('joined');
    b.send({ type: 'create', name: 'B' });
    const joinedB = await b.next('joined');
    a.send({ type: 'rejoin', code: joinedB.code, token: joinedB.token });
    expect((await a.next('joined')).seat).toBe(0);
    expect(srv.registry.get(joinedA.code)!.connectedHumans()).toBe(0); // no phantom seat left behind in A
    a.ws.close(); b.ws.close();
  });
  it('replies with an error (not a close) for an unrecognized message type', async () => {
    const c = new Client(srv.port); await c.open();
    c.send({ type: 'bogus' } as unknown as ClientMessage);
    expect((await c.next('error')).message).toMatch(/unknown/i);
    expect(c.ws.readyState).toBe(c.ws.OPEN);
    c.ws.close();
  });
  it('throttles a connection sending too many messages, closing the socket with 1008', async () => {
    const s5 = await startServer({ port: 0, allowedOrigins: ['http://localhost:5173'], dev: true, limits: { msgPerSec: 5, burst: 5 } });
    const c = new Client(s5.port); await c.open();
    const closed = new Promise<number>((res) => c.ws.once('close', (code) => res(code)));
    for (let i = 0; i < 100; i++) c.send({ type: 'leave' });
    expect(await closed).toBe(1008);
    await s5.close();
  });
  it('rate-limits repeated failed join/rejoin attempts per IP', async () => {
    const s4 = await startServer({ port: 0, allowedOrigins: ['http://localhost:5173'], dev: false, limits: { joinFailures: 3 } });
    const c = new Client(s4.port); await c.open();
    for (let i = 0; i < 3; i++) {
      c.send({ type: 'join', code: 'ZZZZ', name: 'X' });
      expect((await c.next('error')).code).toBe('NO_ROOM');
    }
    c.send({ type: 'join', code: 'ZZZZ', name: 'X' });
    expect((await c.next('error')).code).toBe('RATE');
    c.ws.close(); await s4.close();
  });
  it('close() destroys every room, not just the sockets', async () => {
    const s3 = await startServer({ port: 0, allowedOrigins: ['http://localhost:5173'], dev: true });
    const c = new Client(s3.port); await c.open();
    c.send({ type: 'create', name: 'A' });
    await c.next('joined');
    expect(s3.registry.rooms.size).toBe(1);
    c.ws.close();
    await s3.close();
    expect(s3.registry.rooms.size).toBe(0);
  });
});
