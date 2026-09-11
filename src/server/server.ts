import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { RoomRegistry } from './rooms';
import { Room, RoomError } from './room';
import { CLIENT_MESSAGE_TYPES, type ClientMessage, type ServerMessage } from './protocol';

export interface Limits {
  /** sustained incoming messages per connection, per second */
  msgPerSec: number;
  /** token-bucket burst size for incoming messages per connection */
  burst: number;
  /** max simultaneous websocket connections, server-wide */
  maxConns: number;
  /** failed join/rejoin attempts allowed per IP within JOIN_FAILURE_WINDOW_MS before further attempts are rate-limited */
  joinFailures: number;
}
export interface ServerOptions {
  port?: number;
  host?: string;
  passphrase?: string | null;
  allowedOrigins?: string[];
  dev?: boolean;
  hostGrace?: number;
  botDelay?: number;
  limits?: Partial<Limits>;
}
interface Conn { id: string; ws: WebSocket; room: Room | null; misses: number; tokens: number; lastRefill: number; ip: string }

const sha = (s: string) => createHash('sha256').update(s).digest();
const sameSecret = (a: string, b: string) => {
  const ha = sha(a);
  const hb = sha(b);
  return timingSafeEqual(ha, hb);
};

const LAN_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;
const CREATE_RATE_MS = 60_000;
const JOIN_FAILURE_WINDOW_MS = 10 * 60_000;
const DEFAULT_LIMITS: Limits = { msgPerSec: 20, burst: 40, maxConns: 200, joinFailures: 20 };
const KNOWN_TYPES = new Set<string>(CLIENT_MESSAGE_TYPES);

export async function startServer(opts: ServerOptions = {}) {
  const dev = opts.dev ?? false;
  const passphrase = opts.passphrase ?? null;
  const origins = new Set(opts.allowedOrigins ?? ['https://geoffreychan.com']);
  const limits: Limits = { ...DEFAULT_LIMITS, ...opts.limits };
  const host = opts.host ?? process.env.HOST ?? (dev ? '0.0.0.0' : '127.0.0.1');
  const conns = new Map<string, Conn>();
  const registry = new RoomRegistry({
    send: (id, msg) => {
      const c = conns.get(id);
      if (!c) return;
      // Once a client is told their room is gone, forget it server-side too, or a stale
      // `c.room` would block them from creating/joining a new one.
      if (msg.type === 'closed') c.room = null;
      if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
    },
    now: () => Date.now(),
    random: Math.random,
    token: () => randomBytes(16).toString('hex'),
    botDelay: opts.botDelay,
    hostGrace: opts.hostGrace,
  });
  const lastCreate = new Map<string, number>();
  // Timestamps (ms) of recent failed join/rejoin attempts, keyed by IP; pruned to the trailing
  // JOIN_FAILURE_WINDOW_MS in the heartbeat so the map doesn't grow unbounded.
  const joinFailures = new Map<string, number[]>();
  const recordJoinFailure = (ip: string) => {
    const arr = joinFailures.get(ip) ?? [];
    arr.push(Date.now());
    joinFailures.set(ip, arr);
  };
  const joinFailureCount = (ip: string) => {
    const cutoff = Date.now() - JOIN_FAILURE_WINDOW_MS;
    return (joinFailures.get(ip) ?? []).filter((t) => t > cutoff).length;
  };
  /** Token-bucket throttle for incoming messages on one connection: refills at `limits.msgPerSec`
   *  per second up to `limits.burst`, and returns false (consuming nothing) once exhausted. */
  const allowMessage = (c: Conn) => {
    const now = Date.now();
    const elapsed = (now - c.lastRefill) / 1000;
    c.tokens = Math.min(limits.burst, c.tokens + elapsed * limits.msgPerSec);
    c.lastRefill = now;
    if (c.tokens < 1) return false;
    c.tokens -= 1;
    return true;
  };

  const http = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (req.method === 'GET' && pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  const wss = new WebSocketServer({
    server: http,
    maxPayload: 16 * 1024,
    verifyClient: ({ origin }: { origin: string | undefined }) => {
      // Refuse new upgrades once we're at the connection cap, before spending an origin check.
      if (conns.size >= limits.maxConns) return false;
      if (!origin) return dev;
      if (origins.has(origin)) return true;
      return dev && LAN_ORIGIN.test(origin);
    },
  });

  wss.on('connection', (ws, req) => {
    const c: Conn = {
      id: randomBytes(8).toString('hex'),
      ws,
      room: null,
      misses: 0,
      tokens: limits.burst,
      lastRefill: Date.now(),
      // Caddy (our reverse proxy) appends the real peer to any existing x-forwarded-for chain,
      // so the trustworthy entry is the last one, not the first (which a client can forge).
      ip: (req.headers['x-forwarded-for'] as string | undefined)?.split(',').pop()?.trim() || req.socket.remoteAddress || '?',
    };
    conns.set(c.id, c);
    const reply = (msg: ServerMessage) => ws.send(JSON.stringify(msg));
    ws.on('pong', () => { c.misses = 0; });
    ws.on('message', (data) => {
      if (!allowMessage(c)) { ws.close(1008, 'too many messages'); return; }
      let msg: ClientMessage;
      try {
        const parsed: unknown = JSON.parse(data.toString());
        if (!parsed || typeof parsed !== 'object' || typeof (parsed as { type?: unknown }).type !== 'string') throw new Error('bad shape');
        msg = parsed as ClientMessage;
      } catch { ws.close(1003, 'bad message'); return; }
      if (!KNOWN_TYPES.has(msg.type)) { reply({ type: 'error', message: 'Unknown message type' }); return; }
      try {
        if (msg.type === 'create') {
          if (c.room) throw new RoomError('Leave your current room first');
          if (typeof passphrase === 'string') {
            if (!sameSecret(String(msg.passphrase ?? ''), passphrase)) throw new RoomError("That is not the family passphrase. It is the one set on this server, not a password you choose.", 'PASSPHRASE');
          } else if (!dev) {
            throw new RoomError('Room creation is disabled', 'PASSPHRASE');
          }
          if (!dev) {
            const t = lastCreate.get(c.ip) ?? 0;
            if (Date.now() - t < CREATE_RATE_MS) throw new RoomError('Slow down: one new room per minute', 'RATE');
          }
          const room = registry.create();
          if (!dev) lastCreate.set(c.ip, Date.now());
          const { seat, token } = room.create(c.id, msg.name);
          c.room = room;
          reply({ type: 'joined', code: room.code, seat, token });
        } else if (msg.type === 'join') {
          if (joinFailureCount(c.ip) >= limits.joinFailures) throw new RoomError('Too many attempts, try again later', 'RATE');
          try {
            if (c.room) throw new RoomError('Leave your current room first');
            const room = registry.get(msg.code);
            if (!room) throw new RoomError('No room with that code', 'NO_ROOM');
            const r = room.join(c.id, msg.name);
            c.room = room;
            reply({ type: 'joined', code: room.code, seat: r.seat, token: r.token });
          } catch (e) {
            recordJoinFailure(c.ip);
            throw e;
          }
        } else if (msg.type === 'rejoin') {
          if (joinFailureCount(c.ip) >= limits.joinFailures) throw new RoomError('Too many attempts, try again later', 'RATE');
          try {
            // Rejoin re-anchors this connection by token, regardless of whatever room (if any) it
            // currently thinks it's in - that's the whole point of reconnecting after a drop. If
            // it's hopping in from a *different* room, disconnect it there first so that room
            // isn't left thinking this connection is still seated (and connected) in it.
            const room = registry.get(msg.code);
            if (!room) throw new RoomError('No room with that code', 'NO_ROOM');
            if (c.room && c.room !== room) c.room.disconnect(c.id);
            const r = room.rejoin(c.id, msg.token);
            c.room = room;
            reply({ type: 'joined', code: room.code, seat: r.seat, token: r.token });
          } catch (e) {
            recordJoinFailure(c.ip);
            throw e;
          }
        } else {
          if (!c.room) throw new RoomError('You are not in a room');
          c.room.handle(c.id, msg);
          if (msg.type === 'leave') c.room = null;
        }
      } catch (e) {
        if (e instanceof RoomError) reply({ type: 'error', message: e.message, code: e.code });
        else { console.error(e); reply({ type: 'error', message: 'Server error' }); }
      }
    });
    ws.on('close', () => { c.room?.disconnect(c.id); conns.delete(c.id); });
  });

  const heartbeat = setInterval(() => {
    for (const c of conns.values()) {
      // Drop a connection only after it has missed TWO consecutive pongs, not one - a single
      // slow round trip (e.g. a phone waking a backgrounded tab) shouldn't cost the seat.
      if (c.misses >= 2) { c.ws.terminate(); continue; }
      c.misses += 1;
      c.ws.ping();
    }
    const now = Date.now();
    for (const [ip, t] of lastCreate) if (now - t > CREATE_RATE_MS) lastCreate.delete(ip);
    for (const [ip, arr] of joinFailures) {
      const kept = arr.filter((t) => now - t <= JOIN_FAILURE_WINDOW_MS);
      if (kept.length === 0) joinFailures.delete(ip); else joinFailures.set(ip, kept);
    }
    for (const code of registry.sweep(now)) console.log(`room ${code} expired`);
  }, 30_000);

  await new Promise<void>((res) => http.listen(opts.port ?? 8787, host, res));
  const port = (http.address() as { port: number }).port;
  return {
    port,
    registry,
    close: () =>
      new Promise<void>((res) => {
        clearInterval(heartbeat);
        // Destroy every room so their host-transfer/bot timers don't keep re-arming after
        // shutdown (Room.destroy clears both, and notifies any still-connected seats).
        for (const code of [...registry.rooms.keys()]) registry.remove(code);
        for (const c of conns.values()) c.ws.terminate();
        wss.close();
        http.closeAllConnections?.();
        http.close(() => res());
      }),
  };
}
