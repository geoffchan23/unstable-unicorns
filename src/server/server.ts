import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { RoomRegistry } from './rooms';
import { Room, RoomError } from './room';
import type { ClientMessage, ServerMessage } from './protocol';

export interface ServerOptions {
  port?: number;
  passphrase?: string | null;
  allowedOrigins?: string[];
  dev?: boolean;
  hostGrace?: number;
  botDelay?: number;
}
interface Conn { id: string; ws: WebSocket; room: Room | null; alive: boolean; ip: string }

const sha = (s: string) => createHash('sha256').update(s).digest();
const sameSecret = (a: string, b: string) => {
  const ha = sha(a);
  const hb = sha(b);
  return timingSafeEqual(ha, hb);
};

const LAN_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.)/;

export async function startServer(opts: ServerOptions = {}) {
  const dev = opts.dev ?? false;
  const passphrase = opts.passphrase ?? null;
  const origins = new Set(opts.allowedOrigins ?? ['https://geoffreychan.com']);
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

  const http = createServer((req, res) => {
    if (req.url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
    res.writeHead(404); res.end();
  });
  const wss = new WebSocketServer({
    server: http,
    maxPayload: 16 * 1024,
    verifyClient: ({ origin }: { origin: string }) => {
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
      alive: true,
      ip: (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.socket.remoteAddress || '?',
    };
    conns.set(c.id, c);
    const reply = (msg: ServerMessage) => ws.send(JSON.stringify(msg));
    ws.on('pong', () => { c.alive = true; });
    ws.on('message', (data) => {
      let msg: ClientMessage;
      try { msg = JSON.parse(data.toString()); if (!msg || typeof msg.type !== 'string') throw new Error(); } catch { ws.close(1003, 'bad message'); return; }
      try {
        if (msg.type === 'create') {
          if (c.room) throw new RoomError('Leave your current room first');
          if (typeof passphrase === 'string') {
            if (!sameSecret(String(msg.passphrase ?? ''), passphrase)) throw new RoomError('Wrong passphrase', 'PASSPHRASE');
          } else if (!dev) {
            throw new RoomError('Room creation is disabled', 'PASSPHRASE');
          }
          if (!dev) {
            const t = lastCreate.get(c.ip) ?? 0;
            if (Date.now() - t < 60_000) throw new RoomError('Slow down: one new room per minute', 'RATE');
            lastCreate.set(c.ip, Date.now());
          }
          const room = registry.create();
          const { seat, token } = room.create(c.id, msg.name);
          c.room = room;
          reply({ type: 'joined', code: room.code, seat, token });
        } else if (msg.type === 'join') {
          if (c.room) throw new RoomError('Leave your current room first');
          const room = registry.get(msg.code);
          if (!room) throw new RoomError('No room with that code', 'NO_ROOM');
          const r = room.join(c.id, msg.name);
          c.room = room;
          reply({ type: 'joined', code: room.code, seat: r.seat, token: r.token });
        } else if (msg.type === 'rejoin') {
          // Rejoin re-anchors this connection by token, regardless of whatever room (if any) it
          // currently thinks it's in - that's the whole point of reconnecting after a drop.
          const room = registry.get(msg.code);
          if (!room) throw new RoomError('No room with that code', 'NO_ROOM');
          const r = room.rejoin(c.id, msg.token);
          c.room = room;
          reply({ type: 'joined', code: room.code, seat: r.seat, token: r.token });
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
      if (!c.alive) { c.ws.terminate(); continue; }
      c.alive = false;
      c.ws.ping();
    }
    for (const code of registry.sweep(Date.now())) console.log(`room ${code} expired`);
  }, 30_000);

  await new Promise<void>((res) => http.listen(opts.port ?? 8787, res));
  const port = (http.address() as { port: number }).port;
  return {
    port,
    registry,
    close: () =>
      new Promise<void>((res) => {
        clearInterval(heartbeat);
        for (const c of conns.values()) c.ws.terminate();
        wss.close();
        http.closeAllConnections?.();
        http.close(() => res());
      }),
  };
}
