import { GameClient, SESSION_KEY } from '../client';

class FakeWS {
  static instances: FakeWS[] = [];
  static OPEN = 1;
  static CLOSED = 3;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeWS.instances.push(this);
  }
  send(s: string) {
    this.sent.push(s);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(m: unknown) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
}
const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
  };
};
const make = (storage = mem()) =>
  new GameClient('ws://x', { WebSocketImpl: FakeWS as unknown as typeof WebSocket, storage, minDelay: 10, maxDelay: 40 });

beforeEach(() => {
  FakeWS.instances = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('GameClient', () => {
  it('queues sends until open and stores the session on joined', () => {
    const storage = mem();
    const c = make(storage);
    c.connect();
    c.create('Geoff', 'moo');
    const ws = FakeWS.instances[0]!;
    expect(ws.sent).toHaveLength(0);
    ws.open();
    expect(JSON.parse(ws.sent[0]!)).toEqual({ type: 'create', name: 'Geoff', passphrase: 'moo' });
    ws.receive({ type: 'joined', code: 'ABCD', seat: 0, token: 't1' });
    expect(JSON.parse(storage.getItem(SESSION_KEY)!)).toEqual({ code: 'ABCD', token: 't1' });
    expect(c.snapshot().joined?.code).toBe('ABCD');
  });

  it('reconnects with backoff and rejoins from the stored session', () => {
    const storage = mem();
    storage.setItem(SESSION_KEY, JSON.stringify({ code: 'ABCD', token: 't1' }));
    const c = make(storage);
    c.connect();
    let ws = FakeWS.instances[0]!;
    ws.open();
    expect(JSON.parse(ws.sent[0]!)).toEqual({ type: 'rejoin', code: 'ABCD', token: 't1' });
    ws.close();
    expect(c.snapshot().status).toBe('closed');
    vi.advanceTimersByTime(10);
    expect(FakeWS.instances).toHaveLength(2);
    FakeWS.instances[1]!.close();
    vi.advanceTimersByTime(19);
    expect(FakeWS.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWS.instances).toHaveLength(3);
    ws = FakeWS.instances[2]!;
    ws.open();
    expect(JSON.parse(ws.sent[0]!).type).toBe('rejoin');
  });

  it('clears the session when the room is gone', () => {
    const storage = mem();
    storage.setItem(SESSION_KEY, JSON.stringify({ code: 'ABCD', token: 't1' }));
    const c = make(storage);
    c.connect();
    const ws = FakeWS.instances[0]!;
    ws.open();
    ws.receive({ type: 'error', message: 'No room with that code', code: 'NO_ROOM' });
    expect(storage.getItem(SESSION_KEY)).toBeNull();
    expect(c.snapshot().error).toMatch(/No room/);
  });

  it('notifies subscribers and keeps snapshot identity when nothing changed', () => {
    const c = make();
    const fn = vi.fn();
    c.subscribe(fn);
    c.connect();
    const s1 = c.snapshot();
    expect(c.snapshot()).toBe(s1);
    FakeWS.instances[0]!.open();
    expect(fn).toHaveBeenCalled();
    expect(c.snapshot()).not.toBe(s1);
    expect(c.snapshot().status).toBe('open');
  });

  it('close() stops reconnecting', () => {
    const c = make();
    c.connect();
    FakeWS.instances[0]!.open();
    c.close();
    vi.advanceTimersByTime(1000);
    expect(FakeWS.instances).toHaveLength(1);
  });

  it('keeps state through a finished lobby and clears it only when a new lobby starts', () => {
    const c = make();
    c.connect();
    const ws = FakeWS.instances[0]!;
    ws.open();
    ws.receive({ type: 'joined', code: 'ABCD', seat: 0, token: 't1' });
    ws.receive({ type: 'state', view: { seat: 0 }, legal: [], seats: [], host: 0 });
    expect(c.snapshot().state).not.toBeNull();

    ws.receive({ type: 'lobby', code: 'ABCD', seats: [], you: 0, host: 0, status: 'finished' });
    expect(c.snapshot().lobby?.status).toBe('finished');
    expect(c.snapshot().state).not.toBeNull();

    ws.receive({ type: 'lobby', code: 'ABCD', seats: [], you: 0, host: 0, status: 'lobby' });
    expect(c.snapshot().lobby?.status).toBe('lobby');
    expect(c.snapshot().state).toBeNull();
  });

  it('resets the rejoining flag on any error so a later unrelated NO_ROOM does not wipe existing lobby/state', () => {
    const storage = mem();
    storage.setItem(SESSION_KEY, JSON.stringify({ code: 'ABCD', token: 't1' }));
    const c = make(storage);
    c.connect();
    const ws = FakeWS.instances[0]!;
    ws.open();
    expect(JSON.parse(ws.sent[0]!)).toEqual({ type: 'rejoin', code: 'ABCD', token: 't1' });

    // The rejoin attempt fails with an unrelated error (no code). The rejoin
    // attempt is over either way, so `rejoining` must be cleared even though
    // this error doesn't match NO_ROOM/BAD_TOKEN.
    ws.receive({ type: 'error', message: 'Server error' });

    // A lobby snapshot arrives from the (now successfully reconnected) room.
    ws.receive({ type: 'lobby', code: 'ABCD', seats: [], you: 0, host: 0, status: 'lobby' });
    expect(c.snapshot().lobby).not.toBeNull();

    // A later, unrelated manual join attempt fails with NO_ROOM. Because the
    // earlier rejoin's `rejoining` flag was properly cleared, this must not
    // wipe the existing lobby snapshot.
    c.join('ZZZZ', 'x');
    ws.receive({ type: 'error', message: 'No room with that code', code: 'NO_ROOM' });

    expect(c.snapshot().lobby).not.toBeNull();
    expect(c.snapshot().error).toMatch(/No room/);
  });

  it('forget() clears storage, resets the snapshot, stops reconnecting, and lets a later connect() start fresh', () => {
    const storage = mem();
    const c = make(storage);
    c.connect();
    const ws = FakeWS.instances[0]!;
    ws.open();
    ws.receive({ type: 'joined', code: 'ABCD', seat: 0, token: 't1' });
    ws.receive({ type: 'lobby', code: 'ABCD', seats: [], you: 0, host: 0, status: 'playing' });
    expect(storage.getItem(SESSION_KEY)).not.toBeNull();

    c.forget();
    expect(storage.getItem(SESSION_KEY)).toBeNull();
    expect(c.snapshot()).toMatchObject({ status: 'closed', joined: null, lobby: null, state: null, error: null, closedReason: null });
    expect(ws.readyState).toBe(FakeWS.CLOSED);

    // no reconnect timer fires
    vi.advanceTimersByTime(1000);
    expect(FakeWS.instances).toHaveLength(1);

    // a later connect() opens a fresh socket without sending rejoin
    c.connect();
    expect(FakeWS.instances).toHaveLength(2);
    const ws2 = FakeWS.instances[1]!;
    ws2.open();
    expect(ws2.sent).toHaveLength(0);
  });

  it('ignores malformed frames without throwing and leaves the snapshot unchanged', () => {
    const c = make();
    c.connect();
    const ws = FakeWS.instances[0]!;
    ws.open();
    const snap = c.snapshot();
    expect(() => ws.onmessage?.({ data: 'not json' })).not.toThrow();
    expect(c.snapshot()).toBe(snap);
  });
});
