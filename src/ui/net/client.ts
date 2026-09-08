import type { ClientMessage, ServerMessage } from '../../server/protocol';

export type ClientStatus = 'connecting' | 'open' | 'closed';
export interface Session {
  code: string;
  token: string;
}
export interface Snapshot {
  status: ClientStatus;
  joined: Extract<ServerMessage, { type: 'joined' }> | null;
  lobby: Extract<ServerMessage, { type: 'lobby' }> | null;
  state: Extract<ServerMessage, { type: 'state' }> | null;
  error: string | null;
  closedReason: string | null;
}
export interface ClientOptions {
  WebSocketImpl?: typeof WebSocket;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  minDelay?: number;
  maxDelay?: number;
}
export const SESSION_KEY = 'uu.session';

export class GameClient {
  private ws: WebSocket | null = null;
  private snap: Snapshot = { status: 'closed', joined: null, lobby: null, state: null, error: null, closedReason: null };
  private listeners = new Set<() => void>();
  private queue: ClientMessage[] = [];
  private delay: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private rejoining = false;
  private WS: typeof WebSocket;
  private storage: ClientOptions['storage'];
  private minDelay: number;
  private maxDelay: number;

  constructor(private url: string, opts: ClientOptions = {}) {
    this.WS = opts.WebSocketImpl ?? WebSocket;
    this.storage = opts.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    this.delay = opts.minDelay ?? 500;
    this.minDelay = this.delay;
    this.maxDelay = opts.maxDelay ?? 8000;
  }

  snapshot() {
    return this.snap;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private set(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  session(): Session | null {
    try {
      const s = this.storage?.getItem(SESSION_KEY);
      return s ? (JSON.parse(s) as Session) : null;
    } catch {
      return null;
    }
  }

  private saveSession(s: Session | null) {
    try {
      if (s) this.storage?.setItem(SESSION_KEY, JSON.stringify(s));
      else this.storage?.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }

  connect() {
    if (this.stopped) this.stopped = false;
    if (this.ws && this.ws.readyState <= 1) return;
    const ws = new this.WS(this.url);
    this.ws = ws;
    this.set({ status: 'connecting' });
    ws.onopen = () => {
      this.delay = this.minDelay;
      this.set({ status: 'open' });
      const s = this.session();
      if (s && !this.queue.some((m) => m.type === 'create' || m.type === 'join')) {
        this.rejoining = true;
        ws.send(JSON.stringify({ type: 'rejoin', ...s }));
      }
      for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
    };
    ws.onmessage = (e: { data: unknown }) => this.onMessage(JSON.parse(String(e.data)) as ServerMessage);
    ws.onerror = () => {
      /* onclose follows */
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.set({ status: 'closed' });
      if (this.stopped) return;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.connect();
      }, this.delay);
      this.delay = Math.min(this.delay * 2, this.maxDelay);
    };
  }

  close() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private onMessage(m: ServerMessage) {
    switch (m.type) {
      case 'joined':
        this.rejoining = false;
        this.saveSession({ code: m.code, token: m.token });
        this.set({ joined: m, error: null, closedReason: null });
        break;
      case 'lobby':
        this.set({ lobby: m, ...(m.status === 'lobby' ? { state: null } : {}) });
        break;
      case 'state':
        this.set({ state: m });
        break;
      case 'error':
        if (this.rejoining && (m.code === 'NO_ROOM' || m.code === 'BAD_TOKEN')) {
          this.rejoining = false;
          this.saveSession(null);
          this.set({ joined: null, lobby: null, state: null, error: m.message });
        } else {
          this.set({ error: m.message });
        }
        break;
      case 'closed':
        this.saveSession(null);
        this.set({ joined: null, lobby: null, state: null, closedReason: m.reason });
        break;
    }
  }

  send(m: ClientMessage) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
    else this.queue.push(m);
  }

  create(name: string, passphrase: string) {
    this.saveSession(null);
    this.send({ type: 'create', name, passphrase });
  }

  join(code: string, name: string) {
    this.saveSession(null);
    this.send({ type: 'join', code: code.trim().toUpperCase(), name });
  }

  leave() {
    this.send({ type: 'leave' });
    this.saveSession(null);
    this.set({ joined: null, lobby: null, state: null });
  }

  clearError() {
    this.set({ error: null });
  }
}
