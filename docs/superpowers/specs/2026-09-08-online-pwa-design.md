# Online multiplayer PWA — design

Date: 2026-09-08. Supersedes the "Agreed plan for mobile" (Capacitor + PWA + LAN server) that
previously lived in `CLAUDE.md`.

## 1. Goal

Play Unstable Unicorns with the family on iPads and Pixel phones, each on their own device,
without a laptop at the table. Local pass-and-play and play-vs-bot keep working, offline.

Decisions already made (do not relitigate):

- **Web only, installed as a PWA.** No Capacitor, no native code, no app stores.
- **Static app on GitHub Pages at `https://geoffreychan.com/unicorns/`**, committed into the
  personal-site repo (`geoffchan23.github.io`) the same way `levi-word-game` and
  `paris-study-game` are. DNS stays at GoDaddy pointing at GitHub.
- **Game server on the existing Oracle Always Free VM** (`140.238.145.208`, Ubuntu 22.04,
  Node 20, pm2), reached at `wss://play.geoffreychan.com` via Caddy with an automatic
  Let's Encrypt certificate. No Cloudflare.
- **Card art is published** in the static build. Family, non-commercial; if a takedown
  arrives, the art is removed. `assets/art/` stays gitignored in this repo; the deploy runs
  from a machine that has the art.
- **A shared family passphrase** is required to create a room. Joining needs only the room
  code. Nothing else is authenticated.
- **Games live in server memory only.** A server restart ends games in progress.

## 2. Shape

```
geoffreychan.com/unicorns/     GitHub Pages, static PWA (React app + manifest + service worker + art)
        │  wss://
play.geoffreychan.com          Oracle VM: Caddy (TLS, :443) -> Node game server (:8787, pm2)
```

Three pieces, all in this repo:

| Piece | Path | Depends on |
|---|---|---|
| Engine (unchanged) | `src/engine/` | nothing |
| Game server | `src/server/` | engine, `ws` |
| Web client | `src/ui/` | engine (local play), server protocol (online play) |

The engine stays free of DOM and network imports; the existing test enforces this. The server
is likewise pure Node: no React imports, and the room logic has no `ws` import so it can be
tested without sockets.

## 3. Server

### 3.1 Modules

- `src/server/protocol.ts` — message types shared with the client (imported by both).
- `src/server/room.ts` — `Room` class: seats, lobby state, game state, bot driver. Pure
  logic; talks to clients through a `send(seat, message)` callback injected at construction.
- `src/server/rooms.ts` — room registry: create with a fresh 4-letter code (A–Z, no
  ambiguous I/O), lookup, idle expiry.
- `src/server/index.ts` — HTTP + WebSocket server (`ws`), origin check, passphrase check,
  socket ↔ seat mapping, heartbeat.

### 3.2 Room lifecycle

```
lobby ──start──> playing ──winner──> finished ──playAgain──> lobby
  any state ──idle 2h or empty 10min──> deleted
```

- **Seats**: `{ name, kind: 'human' | 'bot', token, connected }`. 2–8 seats. The creator holds
  seat 0 and is the host. Host powers: add/remove bot, remove a human seat, start, play
  again, replace an absent human with a bot mid-game.
- **Tokens**: each human seat gets a random 128-bit token on join. The client stores
  `{ code, token }` in `localStorage` and sends `rejoin` on every fresh connection, so a
  locked screen, a wifi drop, or a page reload resumes the same seat.
- **Start**: host sends `start`; server calls `createGame({ players: names, seed })`. Seed
  is random unless the host supplies one.
- **Actions**: a `action` message carries an engine `Action`. The server overwrites
  `action.player` with the sender's seat (clients cannot act for others), calls
  `applyAction`, and on `IllegalAction` replies with `error` to that client only. After
  every state change the server broadcasts.
- **Broadcast**: each connected human seat receives
  `state { view: viewFor(state, seat), legal: legalActions(state, seat), seats }`.
  Views are per-seat, so hidden hands never leave the server.
- **Bots**: after each state change, if `playersToAct(state)` contains a bot seat, the server
  schedules `greedyBotAction` for it after 650 ms (one timer per room, cleared on any new
  state). Same bot code as local play.
- **Absent players**: the game does not pause. If a human seat is disconnected and the game
  is waiting on them, the lobby panel shows it and the host may turn that seat into a bot
  for the rest of the game.
- **Finished**: when `state.winner !== null` the room enters `finished`. `playAgain` from
  the host returns everyone to the lobby with the same seats.

### 3.3 Protocol

JSON text frames. Every client message may receive `error { message }` in reply.

Client → server:

| type | fields | notes |
|---|---|---|
| `create` | `name, passphrase` | creates room, sender becomes host (seat 0) |
| `join` | `code, name` | lobby only; 8-seat cap |
| `rejoin` | `code, token` | any state; reattaches socket to seat |
| `addBot` / `removeSeat` | `seat?` | host, lobby only |
| `start` | `seed?` | host, lobby only, ≥2 seats |
| `action` | `action: Action` | playing only |
| `replaceWithBot` | `seat` | host, playing only, seat must be disconnected |
| `playAgain` | | host, finished only |
| `leave` | | lobby only; host leaving deletes the room |

Server → client:

| type | fields | notes |
|---|---|---|
| `joined` | `code, seat, token` | reply to `create` / `join` / `rejoin` |
| `lobby` | `code, seats, you, status` | sent on any lobby/seat change, in every state |
| `state` | `view, legal, seats` | per-seat, after every game change and on rejoin |
| `error` | `message` | |
| `closed` | `reason` | room deleted or seat removed |

`seats` in `lobby`/`state` is `{ name, kind, connected }[]` so the game screen can badge bots
and show who is offline.

### 3.4 Transport and hardening

- `ws` server on `PORT` (default 8787), plain HTTP; Caddy terminates TLS.
- `GET /healthz` returns `ok` for pm2 and for a quick curl.
- Origin check: connections whose `Origin` is not in `ALLOWED_ORIGINS` (comma list; default
  `https://geoffreychan.com`) are rejected. Local dev sets it to `http://localhost:5173`.
- Passphrase: `UNICORNS_PASSPHRASE` env var; compared with constant-time equality; missing
  env var means create is refused (fail closed) except when `NODE_ENV=development`.
- Message size cap 16 KB; malformed JSON closes the socket; ping every 30 s, drop after two
  missed pongs.
- Limits: 50 rooms; a client may create at most one room per minute per IP.

### 3.5 Build and deploy

- `npm run build:server` → esbuild bundles `src/server/index.ts` and its deps (including
  `ws`) into `dist/server/unicorns-server.mjs`, platform node, target node20. One file, no
  `npm install` on the VM.
- `scripts/deploy-server.sh` → builds, `scp`s the file to `~/unicorns/` on the VM, then
  `pm2 restart unicorns || pm2 start ... --name unicorns`, `pm2 save`. Uses the same SSH key
  as the Wordle bot (`~/.ssh/oci_wordle_key`).
- One-time VM setup, documented in `docs/DEPLOY.md` and done together in a session:
  1. GoDaddy: `A play → 140.238.145.208`.
  2. OCI security list: ingress TCP 80 and 443 from `0.0.0.0/0` (console, or `oci` CLI
     after `oci session authenticate`).
  3. VM: `iptables` allow 80/443 (`netfilter-persistent save`); install Caddy from its apt
     repo; `/etc/caddy/Caddyfile`: `play.geoffreychan.com { reverse_proxy localhost:8787 }`.
  4. `~/unicorns/.env` with `UNICORNS_PASSPHRASE`, `PORT=8787`, `ALLOWED_ORIGINS`;
     pm2 ecosystem file reads it; `pm2 startup` already configured for the Wordle bot.

## 4. Client

### 4.1 Refactor: one game screen, two drivers

Today `Game` in `App.tsx` owns engine state, bots, hot-seat handoff, and rendering, and it
reads `GameState` directly. Split it:

- `src/ui/GameScreen.tsx` — presentational. Props:
  `{ view: PlayerView, legal: Action[], seats: SeatInfo[], onAction(a: Action), onQuit,
  banner?: ReactNode }`. Renders everything the current `Game` renders, including sheets and
  `PromptSheet`, but reads only from `view` and `legal`. `PlayerView` already carries
  `turn`, `pending`, `stack`, `log`, `cards`, `discard`, `nursery`, `winner`,
  `unicornsToWin`; the two places that touch `deck` (card-location badge in `PromptSheet`)
  treat "not found in any visible zone" as "deck".
- `src/ui/LocalGame.tsx` — the existing local driver: `createGame`, `applyAction`, bot
  timer, viewer switching and the pass-the-device overlay. Computes `view`/`legal` for the
  current viewer and renders `GameScreen`.
- `src/ui/OnlineGame.tsx` — socket driver: holds the latest `state` message, renders
  `GameScreen` with `onAction` = send `action`. Shows a "Reconnecting…" banner while the
  socket is down and a "waiting on X (offline)" note from `seats`.
- `src/ui/net/client.ts` — `GameClient`: one WebSocket with exponential-backoff reconnect
  (0.5 s → 8 s), auto-`rejoin` from `localStorage`, typed `send`, and a subscribe API. No
  React inside, so it can be unit tested with a fake socket.
- `src/ui/Lobby.tsx` — create/join form, then the seat list with host controls and a big
  Start button. Room code shown large, with a "share" button that copies
  `https://geoffreychan.com/unicorns/?join=CODE` (the app reads `?join=` on load and
  prefills the code).

`App.tsx` becomes a three-way router: Home (Play online / Play on this device), Local
(existing Setup → LocalGame), Online (Lobby → OnlineGame → Lobby again on play-again).
`localStorage` keys: `uu.name`, `uu.session` (`{ code, token }`), `uu.passphrase`.

Server URL: build-time define `__SERVER_URL__` (default `wss://play.geoffreychan.com`); a
`?server=` query parameter overrides it and is remembered, for testing against a local
server from a phone.

### 4.2 PWA shell

- `manifest.webmanifest`: name "Unstable Unicorns", `start_url: "./"`, `scope: "./"`,
  `display: standalone`, `orientation: any`, theme/background colours from `styles.css`,
  icons 192/512 (maskable) generated from a simple unicorn glyph in `scripts/icons.mjs`.
- `sw.js`: precache list injected at build (all files in the output with a build hash as
  the cache name). Strategy: cache-first for hashed JS/CSS/art/icons; network-first with
  cache fallback for `index.html` and the manifest; runtime cache for Google Fonts responses.
  On activate, delete caches from other builds. The page listens for a waiting worker and
  shows a small "Update available — reload" toast.
- `index.html`: `viewport-fit=cover`, `apple-mobile-web-app-capable`,
  `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`, `theme-color`.
- CSS: `env(safe-area-inset-*)` padding on the top bar and hand tray; `overscroll-behavior:
  none`; `-webkit-user-select: none` on cards.
- Wake lock: request `navigator.wakeLock` while a game is on screen, re-request on
  `visibilitychange`. Silent no-op where unsupported.
- Offline: local modes work fully offline once installed. Online mode shows "You're offline"
  and keeps retrying.

### 4.3 Build and deploy

- `scripts/build.mjs` is replaced. `npm run build` → `dist/unicorns/` containing
  `index.html`, `app.<hash>.js`, `app.<hash>.css`, `manifest.webmanifest`, `sw.js`,
  `icons/`, `art/<card-id>.webp`. All URLs relative, so the folder works at any path and
  under `npx serve dist` locally.
- Art becomes files in `art/` instead of inlined data URIs; `artFor(id)` returns
  `art/${id}.webp`. Smaller initial load; the service worker precaches them.
- `npm run dev` → esbuild serve + watch on `:5173` and the game server on `:8787` with
  `NODE_ENV=development` (no passphrase, localhost origins allowed).
- `scripts/deploy-web.sh` → `npm run build`, then rsync `dist/unicorns/` to
  `$SITE_REPO/unicorns/` (default `../../geoffchan23.github.io`), then in the site repo
  `git add unicorns && git commit -m "unicorns: deploy <short sha>" && git push`. The site's
  `.gitignore` needs `!unicorns/**/*.png` for the icons.
- The single-file `dist/unstable-unicorns.html` build and `scripts/shot.mjs` are retired.
- GitHub Actions (`.github/workflows/ci.yml`): `npm ci`, `npm run typecheck`, `npm test` on
  push and PR. No deploy from CI (art is not in the repo).

## 5. Error handling

| Situation | Behaviour |
|---|---|
| Illegal action from a client | server replies `error`; client shows the existing toast; state unchanged |
| Socket drops mid-game | client reconnects with backoff and `rejoin`; server keeps the seat; banner shown |
| Player never comes back | host uses "Replace with bot" on that seat |
| Host disconnects | room continues; host powers resume on rejoin; no host transfer (YAGNI) |
| Server restart | rooms gone; clients get connection refused, then `error: no such room` on rejoin, clear session, return home |
| Wrong passphrase / wrong code / full room | `error`, shown inline on the lobby form |
| Malformed message | socket closed |

## 6. Testing

- Engine tests unchanged (91).
- `src/server/__tests__/room.test.ts`: drive `Room` with a recording `send` — lobby flow,
  token rejoin, player spoofing rejected, illegal action → error only to sender, per-seat
  view hides other hands, bot seats act after the timer (fake timers), replace-with-bot,
  finished → playAgain, idle expiry.
- `src/server/__tests__/protocol.test.ts`: a real `ws` server on an ephemeral port with two
  clients through a full 2-player game driven by `randomBotAction` on each client's `legal`
  list; asserts both clients see the same winner.
- `src/ui/net/__tests__/client.test.ts`: `GameClient` reconnect and auto-rejoin with a fake
  WebSocket.
- Manual: `npm run dev`, open on the Mac and on a phone via `?server=ws://<mac-ip>:8787`;
  install on an iPad and a Pixel from the live URL and play one game.

## 7. Out of scope

Spectators, host transfer, game persistence across restarts, chat, animations, accounts,
matchmaking, more than one game per room, expansions.

## 8. Milestones

1. Client refactor (`GameScreen` + `LocalGame`) with no behaviour change; new build output.
2. Server: room logic with tests, then the `ws` transport.
3. Client online mode: `GameClient`, Lobby, `OnlineGame`; play end-to-end with `npm run dev`.
4. PWA shell: manifest, service worker, icons, safe areas, wake lock.
5. Deploy: VM setup session, `deploy-server.sh`, `deploy-web.sh`, first live game.
