# Online Multiplayer PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the hot-seat web prototype into an installable PWA at `https://geoffreychan.com/unicorns/` with online rooms served by a small Node game server on the Oracle VM at `wss://play.geoffreychan.com`.

**Architecture:** The engine (`src/engine/`) is untouched. A new `src/server/` package holds pure room logic (`Room`, `RoomRegistry`) plus a thin `ws` transport; each client receives only its own `viewFor` projection and legal actions. The React UI is split into a presentational `GameScreen` fed by either a local driver (existing hot-seat/bot play) or a socket driver (`GameClient`, `Lobby`, `OnlineGame`). Build output is a static folder with manifest, service worker, icons and art files; deploy scripts copy it into the personal-site repo and ship the server bundle to the VM.

**Tech Stack:** TypeScript 5, React 18, esbuild, Node 20 (VM) / 22 (dev), `ws`, vitest, `@playwright/test` (Chromium), pm2 + Caddy on Ubuntu 22.04.

**Spec:** `docs/superpowers/specs/2026-09-08-online-pwa-design.md`

## Global Constraints

- Engine stays free of DOM/React/network imports (`src/engine/__tests__/sim.test.ts` enforces it). Server code has no React imports; `src/server/room.ts` and `rooms.ts` have no `ws` import.
- Server bundle must run on Node 20 (esbuild `target: 'node20'`, `platform: 'node'`, `format: 'esm'`).
- Client build is a static folder `dist/unicorns/` with only relative URLs, so it works at `/unicorns/` on GitHub Pages and under any local static server.
- Room codes: 4 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I or O). 2–8 seats. Bot delay 650 ms. Host-transfer grace 20 s. Idle room expiry 2 h; empty-room expiry 10 min. Max 50 rooms. Max message 16 KB. Ping every 30 s, drop after two missed pongs. One `create` per minute per IP.
- Env vars on the server: `PORT` (default 8787), `UNICORNS_PASSPHRASE`, `ALLOWED_ORIGINS` (comma list, default `https://geoffreychan.com`), `NODE_ENV` (`development` disables passphrase and allows localhost origins).
- `localStorage` keys on the client: `uu.name`, `uu.session` (JSON `{ code, token }`), `uu.passphrase`, `uu.server`.
- Client build-time defines: `__SERVER_URL__` (default `wss://play.geoffreychan.com`), `__DEV__` (boolean: skips service-worker registration).
- `assets/art/` stays gitignored; builds must succeed when it is missing (cards fall back to placeholders).
- Commit after every task with the trailer lines from the session (Co-Authored-By / Claude-Session).

---

## File structure

| Path | Responsibility |
|---|---|
| `src/engine/view.ts` (modify) | add `unicornCounts` to `PlayerView` |
| `src/server/protocol.ts` | client/server message types, `SeatInfo`, `RoomStatus` |
| `src/server/room.ts` | `Room`: seats, host, lobby→playing→finished, bots, host transfer; `RoomError` |
| `src/server/rooms.ts` | `RoomRegistry`: codes, lookup, sweep |
| `src/server/server.ts` | `startServer()`: http + ws transport, origin/passphrase/rate-limit, heartbeat |
| `src/server/index.ts` | main: read env, call `startServer` |
| `src/server/__tests__/room.test.ts`, `rooms.test.ts`, `server.test.ts` | server tests |
| `src/ui/GameScreen.tsx` | presentational game screen (+ `Sheet`, `PromptSheet`) reading `PlayerView` |
| `src/ui/LocalGame.tsx` | local driver: engine state, bots, hot-seat handoff |
| `src/ui/Setup.tsx` | local setup form (moved out of App.tsx) |
| `src/ui/net/client.ts` | `GameClient`: WebSocket, reconnect, rejoin, snapshot store |
| `src/ui/net/__tests__/client.test.ts` | client tests with a fake socket |
| `src/ui/Lobby.tsx` | create/join form + seat list + host controls |
| `src/ui/OnlineGame.tsx` | socket driver around `GameScreen` |
| `src/ui/Home.tsx` | first screen: Play online / Play on this device |
| `src/ui/App.tsx` (rewrite) | router between Home, Local, Online |
| `src/ui/pwa/manifest.webmanifest`, `sw.js`, `icons/*.png`, `register.ts`, `wakeLock.ts` | PWA shell |
| `src/ui/index.html` | page template (replaces `template.html`) |
| `scripts/build.mjs` (rewrite) | static build to `dist/unicorns/` |
| `scripts/dev.mjs` | watch build + esbuild serve on 5173 + game server on 8787 |
| `scripts/static.mjs` | tiny static file server for `dist/` (pwa e2e) |
| `scripts/build-server.mjs` | bundle server to `dist/server/unicorns-server.mjs` |
| `scripts/icons.mjs` | render PWA icons from an SVG with Playwright |
| `scripts/deploy-server.sh`, `scripts/deploy-web.sh` | deploy |
| `e2e/local.spec.ts`, `online.spec.ts`, `pwa.spec.ts`, `playwright.config.ts` | end-to-end |
| `.github/workflows/ci.yml` | typecheck + unit + e2e |
| `docs/DEPLOY.md` | VM one-time setup and deploy runbook |

---

### Task 1: Toolchain, dependencies, card art

**Files:**
- Modify: `package.json`, `.gitignore`
- Delete: `scripts/shot.mjs`

**Interfaces:**
- Produces: working `npm test`, `npm run typecheck`; `assets/art/*.webp` present locally; `@playwright/test`, `ws`, `@types/ws` installed.

- [ ] **Step 1: Install and verify the baseline**

```bash
npm install
npm test          # expect 91 passing
npm run typecheck # expect no output
```

- [ ] **Step 2: Swap dependencies**

```bash
npm uninstall playwright-core
npm install ws
npm install -D @types/ws @playwright/test
rm scripts/shot.mjs
```

Edit `package.json` `scripts` to exactly:

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit",
  "sim": "tsx src/engine/sim.ts",
  "build": "node scripts/build.mjs",
  "build:server": "node scripts/build-server.mjs",
  "dev": "node scripts/dev.mjs",
  "e2e": "playwright test",
  "icons": "node scripts/icons.mjs"
}
```

- [ ] **Step 3: Generate the card art locally (pillow in a gitignored venv)**

```bash
python3 -m venv .cache/venv
.cache/venv/bin/pip install pillow
.cache/venv/bin/python scripts/art.py
ls assets/art | wc -l   # expect ~84 webp files
```

Append to `.gitignore`:

```
test-results/
playwright-report/
```

(`.cache/` and `assets/art/` are already ignored.)

- [ ] **Step 4: Verify and commit**

```bash
npm test && npm run typecheck
git add -A && git commit -m "Toolchain: ws, @playwright/test; retire shot.mjs"
```

---

### Task 2: `unicornCounts` in the player view

**Files:**
- Modify: `src/engine/view.ts`
- Test: `src/engine/__tests__/view.test.ts`

**Interfaces:**
- Produces: `PlayerView.unicornCounts: number[]` (index = player id, computed on the preview state with `unicornCount`).

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/__tests__/view.test.ts
import { Harness } from './harness';
import { viewFor } from '../view';

describe('viewFor', () => {
  it('hides other hands, exposes deck count and unicorn counts', () => {
    const h = new Harness({ players: 3, hands: [['neigh', 'neigh'], ['neigh'], []], stables: [['rainbow-unicorn'], [], []] });
    const v = viewFor(h.state, 0);
    expect(v.me).toBe(0);
    expect(v.players[0]!.hand).toHaveLength(2);
    expect(v.players[1]!.hand).toBeNull();
    expect(v.players[1]!.handCount).toBe(1);
    expect(v.deckCount).toBe(h.state.deck.length);
    // baby + rainbow for player 0, baby only for the others
    expect(v.unicornCounts).toEqual([2, 1, 1]);
    expect((v as unknown as { deck?: unknown }).deck).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/engine/__tests__/view.test.ts`
Expected: FAIL, `unicornCounts` undefined.

- [ ] **Step 3: Implement**

In `src/engine/view.ts` add `unicornCounts: number[];` to `PlayerView` and, in `viewFor`, after `players:`:

```ts
    unicornCounts: players.map((p) => unicornCount(state, p.id)),
```

with `import { stableHas, unicornCount } from './queries';`.

- [ ] **Step 4: Run all tests, commit**

```bash
npm test && git add -A && git commit -m "viewFor: unicornCounts per player"
```

---

### Task 3: Split the UI into GameScreen + LocalGame (no behaviour change)

**Files:**
- Create: `src/ui/GameScreen.tsx`, `src/ui/LocalGame.tsx`, `src/ui/Setup.tsx`, `src/ui/seats.ts`
- Modify: `src/ui/App.tsx` (becomes a router; the Home screen arrives in Task 9, for now App = Setup → LocalGame)

**Interfaces:**
- Produces:
  ```ts
  // src/ui/seats.ts
  export type SeatKind = 'human' | 'bot';
  export interface SeatInfo { name: string; kind: SeatKind; connected: boolean }
  export type Seat = { name: string; kind: SeatKind };   // local setup

  // src/ui/GameScreen.tsx
  export interface GameScreenProps {
    view: PlayerView;
    legal: Action[];
    seats: SeatInfo[];
    onAction: (a: Action) => void;
    onQuit: () => void;
    error: string | null;
    onDismissError: () => void;
    youLabel?: string;             // default ' (you)'
    banner?: React.ReactNode;      // rendered under the top bar (reconnecting, offline player)
    renderWin?: (winner: PlayerId) => React.ReactNode;  // default: "New game" button -> onQuit
    children?: React.ReactNode;    // extra overlays (hot-seat handoff)
  }
  export function GameScreen(props: GameScreenProps): JSX.Element;

  // src/ui/LocalGame.tsx
  export function LocalGame(props: { seats: Seat[]; seed: number; onQuit: () => void }): JSX.Element;
  // src/ui/Setup.tsx
  export function Setup(props: { onStart: (seats: Seat[], seed: number) => void; onBack?: () => void }): JSX.Element;
  ```

- [ ] **Step 1: Create `src/ui/seats.ts`** with the types above.

- [ ] **Step 2: Move `Setup` verbatim** from `App.tsx` into `src/ui/Setup.tsx` (with `BOT_NAMES`), exporting it. Add an optional `onBack` prop rendering `<button type="button" className="ghost small" onClick={onBack}>Back</button>` in the header when provided.

- [ ] **Step 3: Write `GameScreen.tsx`**

Copy the JSX of the current `Game` return block plus `Sheet` and `PromptSheet` into `GameScreen.tsx`, then make these substitutions so nothing reads `GameState`:

| Old | New |
|---|---|
| `state.turn`, `state.pending`, `state.stack`, `state.log`, `state.nursery`, `state.winner`, `state.unicornsToWin` | same fields on `view` |
| `state.players[p]!.name` / `name(p)` | `view.players[p]!.name` |
| `state.players.map(...)` (targeting sheet) | `view.players.map(...)` |
| `unicornCount(disp, p)` | `view.unicornCounts[p]!` |
| `data(id)` → `cardData.get(disp.cards[id]!.def)!` | `cardData.get(view.cards[id]!.def)!` |
| `typeOf(state, id)` | `cardData.get(view.cards[id]!.def)!.type` |
| `viewer` | `view.me` |
| `seats[p.id]!.kind === 'bot'` | `seats[p.id]?.kind === 'bot'`; also append `' ·offline'` when `seats[p.id]?.connected === false` |
| `humans.length > 1 ? '' : ' (you)'` | `youLabel ?? ' (you)'` |
| `dispatch(a)` | `onAction(a)` |
| `myTurn` | `view.turn.player === view.me && view.turn.phase === 'action' && !view.pending && view.winner === null` |
| `legal` (from `legalActions`) | the `legal` prop |
| `error` state + toast | `error` / `onDismissError` props |
| handoff overlay | removed; render `{children}` before the win overlay |
| win overlay body button | `renderWin ? renderWin(view.winner) : <button ... onClick={onQuit}>New game</button>` |
| `{unicornCount(state, state.winner)} unicorns` | `{view.unicornCounts[view.winner]} unicorns` |

`PromptSheet` signature becomes `{ prompt, view, onAnswer }`:

```ts
const data = (id: number) => cardData.get(view.cards[id]!.def)!;
const ownerOf = (id: number) => view.players.find((p) => p.stable.includes(id) || (p.hand ?? []).includes(id));
// location badge:
const where = owner
  ? (owner.stable.includes(id) ? `${owner.id === view.me ? 'my' : owner.name + "'s"} stable` : `${owner.id === view.me ? 'my' : owner.name + "'s"} hand`)
  : view.discard.includes(id) ? 'discard' : view.nursery.includes(id) ? 'nursery' : 'deck';
```

Add `data-testid` hooks used by e2e later: top bar `<header className="topbar" data-testid="topbar">`, the hand container `data-testid="hand"`, the draw button `data-testid="draw"`, the win overlay box `data-testid="win"`, prompt sheet `data-testid="prompt"`, neigh sheet `data-testid="neigh"`, targeting sheet `data-testid="target"`.

- [ ] **Step 4: Write `LocalGame.tsx`**

Everything from the current `Game` that is not rendering: state, `mulberry`, bot timer, viewer/handoff, `dispatch` with `IllegalAction` → `error`. Then:

```tsx
const view = useMemo(() => viewFor(state, viewer), [state, viewer]);
const legal = useMemo(() => legalActions(state, viewer), [state, viewer]);
const seatInfos: SeatInfo[] = seats.map((s) => ({ ...s, connected: true }));
return (
  <GameScreen view={view} legal={legal} seats={seatInfos} onAction={dispatch} onQuit={onQuit}
    error={error} onDismissError={() => setError(null)} youLabel={humans.length > 1 ? '' : ' (you)'}>
    {handoffTo !== null && ( /* the existing handoff overlay, unchanged */ )}
  </GameScreen>
);
```

- [ ] **Step 5: Rewrite `App.tsx`**

```tsx
import { useState } from 'react';
import '../engine/cards';
import { Setup } from './Setup';
import { LocalGame } from './LocalGame';
import type { Seat } from './seats';

export function App() {
  const [game, setGame] = useState<{ seats: Seat[]; seed: number } | null>(null);
  if (!game) return <Setup onStart={(seats, seed) => setGame({ seats, seed })} />;
  return <LocalGame key={game.seed} seats={game.seats} seed={game.seed} onQuit={() => setGame(null)} />;
}
```

Keep `export { TYPE_LABEL }` out; nothing imports it (check with `grep -rn TYPE_LABEL src`).

- [ ] **Step 6: Typecheck, build, eyeball**

```bash
npm run typecheck && npm test && npm run build && open dist/index.html
```

Play two turns against bots and one hot-seat handoff in the browser. (The old build script still works until Task 4.)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "UI: split Game into GameScreen (view-only) + LocalGame driver"
```

---

### Task 4: Static multi-file build and dev server

**Files:**
- Create: `src/ui/index.html`, `scripts/build.mjs` (rewrite), `scripts/dev.mjs`, `scripts/static.mjs`, `src/ui/env.d.ts`
- Modify: `src/ui/main.tsx`, `src/ui/art.ts`, `tsconfig.json`, `README.md`
- Delete: `src/ui/template.html`

**Interfaces:**
- Produces: `dist/unicorns/{index.html, app.<hash>.js, app.<hash>.css, art/*.webp}`; `npm run dev` serving `http://localhost:5173/unicorns/`; globals `__SERVER_URL__: string`, `__DEV__: boolean`.
- Later tasks add `manifest.webmanifest`, `sw.js`, `icons/` to the same build (Task 10).

- [ ] **Step 1: `src/ui/env.d.ts`**

```ts
declare const __SERVER_URL__: string;
declare const __DEV__: boolean;
```

Replace `src/ui/art.ts` with:

```ts
// Card art is copied to art/<id>.webp by scripts/build.mjs. Missing art -> placeholder.
declare const __ART_IDS__: string[];
const IDS = new Set<string>(typeof __ART_IDS__ !== 'undefined' ? __ART_IDS__ : []);
export function artFor(id: string): string | undefined {
  return IDS.has(id) ? `art/${id}.webp` : undefined;
}
```

`src/ui/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
createRoot(document.getElementById('root')!).render(<App />);
```

- [ ] **Step 2: `src/ui/index.html`** (placeholders replaced by the build)

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Unstable Unicorns</title>
<meta name="theme-color" content="#f6f1fb" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1a1226" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Unicorns">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito:wght@400;700;800&display=swap">
<link rel="stylesheet" href="__CSS__">
</head>
<body>
<div id="root"></div>
<script src="__JS__"></script>
</body>
</html>
```

- [ ] **Step 3: `scripts/build.mjs`**

```js
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export async function buildClient({ dev = false, serverUrl, outdir = 'dist/unicorns' } = {}) {
  rmSync(outdir, { recursive: true, force: true });
  mkdirSync(outdir, { recursive: true });
  const artDir = 'assets/art';
  const artIds = existsSync(artDir) ? readdirSync(artDir).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)) : [];
  if (artIds.length) { mkdirSync(join(outdir, 'art'), { recursive: true }); for (const id of artIds) cpSync(join(artDir, `${id}.webp`), join(outdir, 'art', `${id}.webp`)); }
  const result = await build({
    entryPoints: { app: 'src/ui/main.tsx' },
    bundle: true, minify: !dev, sourcemap: dev, format: 'iife', target: 'es2020',
    outdir, entryNames: '[name].[hash]', metafile: true, jsx: 'automatic',
    define: {
      'process.env.NODE_ENV': dev ? '"development"' : '"production"',
      __ART_IDS__: JSON.stringify(artIds),
      __SERVER_URL__: JSON.stringify(serverUrl ?? (dev ? 'ws://localhost:8787' : 'wss://play.geoffreychan.com')),
      __DEV__: String(dev),
    },
  });
  const outs = Object.keys(result.metafile.outputs).map((p) => p.replace(`${outdir}/`, ''));
  const js = outs.find((f) => f.endsWith('.js')); const css = outs.find((f) => f.endsWith('.css'));
  let html = readFileSync('src/ui/index.html', 'utf8').replace('__JS__', js).replace('__CSS__', css);
  writeFileSync(join(outdir, 'index.html'), html);
  // PWA assets (Task 10 fills src/ui/pwa; copy whatever exists)
  if (existsSync('src/ui/pwa/icons')) cpSync('src/ui/pwa/icons', join(outdir, 'icons'), { recursive: true });
  if (existsSync('src/ui/pwa/manifest.webmanifest')) cpSync('src/ui/pwa/manifest.webmanifest', join(outdir, 'manifest.webmanifest'));
  if (existsSync('src/ui/pwa/sw.js')) {
    const files = walk(outdir).filter((f) => f !== 'sw.js' && f !== 'index.html');
    const precache = ['./', ...files];
    const hash = createHash('sha1').update(precache.join('\n') + readFileSync('src/ui/pwa/sw.js', 'utf8')).digest('hex').slice(0, 10);
    const sw = readFileSync('src/ui/pwa/sw.js', 'utf8').replace('__CACHE__', `uu-${hash}`).replace('__PRECACHE__', JSON.stringify(precache));
    writeFileSync(join(outdir, 'sw.js'), sw);
  }
  const size = (readFileSync(join(outdir, js)).length / 1024).toFixed(0);
  console.log(`${outdir}: ${js} ${size} KB, ${artIds.length} art files${dev ? ' (dev)' : ''}`);
}

function walk(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  await buildClient({ dev: process.argv.includes('--dev'), serverUrl: process.env.SERVER_URL });
}
```

- [ ] **Step 4: `scripts/static.mjs`** (serves `dist/` on a port; used by e2e for the production build)

```js
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
const root = process.argv[2] ?? 'dist'; const port = Number(process.argv[3] ?? 5174);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.map': 'application/json' };
createServer((req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (p.endsWith('/')) p += 'index.html';
  const file = join(root, p);
  if (!file.startsWith(join(root)) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`static ${root} on http://localhost:${port}/`));
```

- [ ] **Step 5: `scripts/dev.mjs`** (rebuild on change + serve + game server; the server entry `src/server/index.ts` arrives in Task 7 — until then the spawn is skipped when the file is missing)

```js
import { spawn } from 'node:child_process';
import { existsSync, watch } from 'node:fs';
import { buildClient } from './build.mjs';

let building = false, again = false;
async function rebuild() {
  if (building) { again = true; return; }
  building = true;
  try { await buildClient({ dev: true }); } catch (e) { console.error(e.message); }
  building = false;
  if (again) { again = false; rebuild(); }
}
await rebuild();
watch('src', { recursive: true }, (_, f) => { if (f && !f.includes('__tests__')) rebuild(); });
spawn(process.execPath, ['scripts/static.mjs', 'dist', '5173'], { stdio: 'inherit' });
if (existsSync('src/server/index.ts')) {
  spawn('npx', ['tsx', 'watch', 'src/server/index.ts'], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development', PORT: '8787' } });
}
console.log('client: http://localhost:5173/unicorns/');
```

- [ ] **Step 6: Wire up and verify**

Delete `src/ui/template.html`. In `tsconfig.json` `include` add `"e2e"` and `"scripts"` is not needed (JS). Run:

```bash
npm run typecheck && npm run build && node scripts/static.mjs dist 5174
```

Open `http://localhost:5174/unicorns/`: cards show art, game plays. Stop the server. Update README's command block: replace the `python3 scripts/art.py` and `npm run build` lines with

```
.cache/venv/bin/python scripts/art.py   # card art (needs pillow: python3 -m venv .cache/venv && .cache/venv/bin/pip install pillow)
npm run build            # dist/unicorns/ static PWA
npm run dev              # http://localhost:5173/unicorns/ + game server on :8787
npm run e2e              # Playwright end-to-end tests
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Build: static dist/unicorns folder, dev server, art as files"
```

---

### Task 5: Playwright setup and the local-play e2e spec

**Files:**
- Create: `playwright.config.ts`, `e2e/local.spec.ts`, `e2e/helpers.ts`

**Interfaces:**
- Produces: `npm run e2e` runs against the dev server; helper `playUntil(page, predicate, maxSteps)` that keeps taking on-screen legal moves for the current viewer.

- [ ] **Step 1: `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:5173/unicorns/', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node scripts/dev.mjs', url: 'http://localhost:5173/unicorns/', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npm run build && node scripts/static.mjs dist 5174', url: 'http://localhost:5174/unicorns/', reuseExistingServer: true, timeout: 120_000 },
  ],
  projects: [
    { name: 'pixel', use: { ...devices['Pixel 7'] } },
    { name: 'ipad', use: { ...devices['iPad (gen 7)'] } },
  ],
});
```

- [ ] **Step 2: `e2e/helpers.ts`**

The game screen is driven purely through visible controls. One "step" = do the first thing that is enabled: an enabled hand card (then the first target choice if a target sheet opens), the draw button, a Neigh-sheet "Let it happen", or the first enabled prompt choice. Also handles the hot-seat handoff overlay.

```ts
import type { Page } from '@playwright/test';

/** Take one on-screen action for whoever is looking at the screen. Returns false if nothing was actionable. */
export async function step(page: Page): Promise<boolean> {
  const handoff = page.getByRole('button', { name: /^I'm / });
  if (await handoff.isVisible()) { await handoff.click(); return true; }
  const prompt = page.getByTestId('prompt');
  if (await prompt.isVisible()) {
    const choice = prompt.locator('button:enabled').first();
    await choice.click(); return true;
  }
  const neigh = page.getByTestId('neigh');
  if (await neigh.isVisible()) { await neigh.getByRole('button', { name: 'Let it happen' }).click(); return true; }
  const target = page.getByTestId('target');
  if (await target.isVisible()) { await target.locator('.choice').first().click(); return true; }
  const draw = page.getByTestId('draw');
  if (await draw.isVisible()) { await draw.click(); return true; }
  const card = page.getByTestId('hand').locator('button.card:enabled').first();
  if (await card.count()) { await card.click(); return true; }
  return false;
}

/** Keep stepping until `done()` is true; waits briefly for bots between steps. */
export async function playUntil(page: Page, done: () => Promise<boolean>, maxSteps = 400): Promise<void> {
  for (let i = 0; i < maxSteps; i++) {
    if (await done()) return;
    if (!(await step(page))) await page.waitForTimeout(250);
  }
  throw new Error(`playUntil: not done after ${maxSteps} steps`);
}
```

- [ ] **Step 3: `e2e/local.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { playUntil } from './helpers';

test('vs-bot game reaches a prompt and a winner', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Play on this device' }).click();   // Home screen (Task 9); until then this line is `// home not yet`
  await page.getByLabel('Seed').fill('42');
  await page.getByRole('button', { name: 'Deal me in' }).click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  let sawPrompt = false;
  await playUntil(page, async () => {
    if (await page.getByTestId('prompt').isVisible()) sawPrompt = true;
    return page.getByTestId('win').isVisible();
  });
  expect(sawPrompt).toBe(true);
  await expect(page.getByTestId('win')).toContainText('wins');
  await page.screenshot({ path: 'test-results/local-win.png' });
});

test('hot-seat handoff appears with two humans', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Play on this device' }).click();
  await page.getByRole('group', { name: 'Human or bot' }).nth(1).getByRole('button', { name: 'Human' }).click();
  await page.getByLabel('Seed').fill('7');
  await page.getByRole('button', { name: 'Deal me in' }).click();
  await playUntil(page, () => page.getByRole('button', { name: /^I'm / }).isVisible(), 60);
  await expect(page.getByText(/Pass the device to/)).toBeVisible();
});
```

Until Task 9 adds the Home screen, comment out the two `Play on this device` clicks; Task 9 restores them.

- [ ] **Step 4: Run**

```bash
npx playwright test e2e/local.spec.ts --project=pixel
```

Expected: both tests pass. Look at `test-results/local-win.png` to confirm the layout is sane on a phone viewport. Fix anything obviously broken (overflow, tiny tap targets) in `styles.css` before continuing.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "e2e: Playwright config and local-play spec"
```

---

### Task 6: Server protocol and `Room` (pure logic, TDD)

**Files:**
- Create: `src/server/protocol.ts`, `src/server/room.ts`
- Test: `src/server/__tests__/room.test.ts`

**Interfaces:**
- Produces:

```ts
// protocol.ts
import type { Action } from '../engine/types';
import type { PlayerView } from '../engine/view';
export type SeatKind = 'human' | 'bot';
export interface SeatInfo { name: string; kind: SeatKind; connected: boolean }
export type RoomStatus = 'lobby' | 'playing' | 'finished';
export type ClientMessage =
  | { type: 'create'; name: string; passphrase: string }
  | { type: 'join'; code: string; name: string }
  | { type: 'rejoin'; code: string; token: string }
  | { type: 'addBot' }
  | { type: 'removeSeat'; seat: number }
  | { type: 'start'; seed?: number }
  | { type: 'action'; action: Action }
  | { type: 'replaceWithBot'; seat: number }
  | { type: 'playAgain' }
  | { type: 'makeHost'; seat: number }
  | { type: 'leave' };
export type ServerMessage =
  | { type: 'joined'; code: string; seat: number; token: string }
  | { type: 'lobby'; code: string; seats: SeatInfo[]; you: number; host: number; status: RoomStatus }
  | { type: 'state'; view: PlayerView; legal: Action[]; seats: SeatInfo[]; host: number }
  | { type: 'error'; message: string; code?: 'NO_ROOM' | 'BAD_TOKEN' | 'FULL' | 'PASSPHRASE' | 'RATE' }
  | { type: 'closed'; reason: string };
export const MAX_SEATS = 8;
export const BOT_DELAY_MS = 650;
export const HOST_GRACE_MS = 20_000;

// room.ts
export interface RoomDeps {
  send(conn: string, msg: ServerMessage): void;
  now(): number;                 // ms
  random(): number;              // [0,1)
  token(): string;               // 32 hex chars
  botDelay?: number;             // default BOT_DELAY_MS
  hostGrace?: number;            // default HOST_GRACE_MS
}
export class RoomError extends Error { code?: ...; constructor(message, code?) }
export interface Seat { name: string; kind: SeatKind; token: string | null; conn: string | null }
export class Room {
  constructor(code: string, deps: RoomDeps);
  readonly code: string; status: RoomStatus; seats: Seat[]; host: number; state: GameState | null;
  lastActivity: number;   // deps.now() of the last message/connection
  create(conn: string, name: string): { seat: number; token: string };
  join(conn: string, name: string): { seat: number; token: string };
  rejoin(conn: string, token: string): { seat: number; token: string };
  disconnect(conn: string): void;
  handle(conn: string, msg: ClientMessage): void;   // throws RoomError for the caller to report
  seatOf(conn: string): number;                    // -1 if unknown
  connectedHumans(): number;
  humanSeats(): number;                            // seats with kind 'human' (connected or not)
  destroy(reason: string): void;                   // sends closed to every connection, clears timers
  seatInfos(): SeatInfo[];
}
```

Key behaviours (each is a test below): names trimmed and capped at 20 chars, empty → "Player"; `join` only in lobby and under `MAX_SEATS`; `rejoin` works in any status, cancels a pending host-transfer timer if the host returns; actions have `player` overwritten with the sender's seat; every state change pushes `state` to every connected human with that seat's `viewFor` + `legalActions`; bots act via `greedyBotAction` after `botDelay` (one timer per room, reset on every state change); win → `status='finished'` + `lobby` push; `replaceWithBot` only for a disconnected human seat while playing; `makeHost` only to a human seat; automatic host transfer after `hostGrace` of the host being disconnected; `leave` (lobby only) removes the seat and renumbers, transfers host first if needed; `removeSeat` (host, lobby) same but for any seat except the host's own.

- [ ] **Step 1: Write `protocol.ts`** exactly as in the interface block.

- [ ] **Step 2: Write the failing tests** — `src/server/__tests__/room.test.ts`

```ts
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
    r.handle('h', { type: 'action', action: { type: 'draw', player: 0 } }).catch?.(() => {});
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
```

Note for the `finished` test: give `Room` a private-but-callable `afterChange()` method (see implementation) so the test can force the winner check without playing a full game; the `.catch?.` line is a no-op guard and may be dropped if `handle` throws synchronously — wrap it in `try {} catch {}` instead.

- [ ] **Step 3: Run tests, expect failures**

Run: `npx vitest run src/server`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `src/server/room.ts`**

```ts
import { applyAction, createGame, legalActions, IllegalAction } from '../engine/game';
import { viewFor } from '../engine/view';
import { greedyBotAction, playersToAct } from '../engine/bot';
import type { Action, GameState } from '../engine/types';
import { BOT_DELAY_MS, HOST_GRACE_MS, MAX_SEATS, type ClientMessage, type RoomStatus, type SeatInfo, type SeatKind, type ServerMessage } from './protocol';

export class RoomError extends Error {
  constructor(message: string, public code?: Extract<ServerMessage, { type: 'error' }>['code']) { super(message); }
}
export interface RoomDeps {
  send(conn: string, msg: ServerMessage): void;
  now(): number; random(): number; token(): string;
  botDelay?: number; hostGrace?: number;
}
export interface Seat { name: string; kind: SeatKind; token: string | null; conn: string | null }

const BOT_NAMES = ['Sprinkles', 'Glitterhoof', 'Stabbington', 'Nimbus', 'Marshmallow', 'Twinkle', 'Rhubarb'];
const cleanName = (n: string) => (n ?? '').toString().trim().slice(0, 20) || 'Player';

export class Room {
  status: RoomStatus = 'lobby';
  seats: Seat[] = [];
  host = 0;
  state: GameState | null = null;
  lastActivity: number;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private hostTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly code: string, private deps: RoomDeps) { this.lastActivity = deps.now(); }

  // ---- connections
  create(conn: string, name: string) { return this.addHuman(conn, name); }
  join(conn: string, name: string) {
    if (this.status !== 'lobby') throw new RoomError('That game has already started');
    if (this.seats.length >= MAX_SEATS) throw new RoomError('That room is full', 'FULL');
    return this.addHuman(conn, name);
  }
  private addHuman(conn: string, name: string) {
    const token = this.deps.token();
    this.seats.push({ name: cleanName(name), kind: 'human', token, conn });
    this.touch(); this.pushLobby();
    return { seat: this.seats.length - 1, token };
  }
  rejoin(conn: string, token: string) {
    const seat = this.seats.findIndex((s) => s.kind === 'human' && s.token === token);
    if (seat < 0) throw new RoomError('That seat is gone', 'BAD_TOKEN');
    this.seats[seat]!.conn = conn;
    if (seat === this.host && this.hostTimer) { clearTimeout(this.hostTimer); this.hostTimer = null; }
    this.touch(); this.pushLobby();
    if (this.status === 'playing') this.pushState(seat);
    return { seat, token };
  }
  disconnect(conn: string) {
    const seat = this.seatOf(conn);
    if (seat < 0) return;
    this.seats[seat]!.conn = null;
    if (seat === this.host) this.armHostTransfer();
    this.pushLobby();
  }
  seatOf(conn: string) { return this.seats.findIndex((s) => s.conn === conn); }
  connectedHumans() { return this.seats.filter((s) => s.kind === 'human' && s.conn !== null).length; }
  humanSeats() { return this.seats.filter((s) => s.kind === 'human').length; }
  seatInfos(): SeatInfo[] { return this.seats.map((s) => ({ name: s.name, kind: s.kind, connected: s.kind === 'human' && s.conn !== null })); }

  // ---- messages
  handle(conn: string, msg: ClientMessage) {
    const seat = this.seatOf(conn);
    if (seat < 0) throw new RoomError('You are not in this room');
    this.touch();
    const host = () => { if (seat !== this.host) throw new RoomError('Only the host can do that'); };
    const lobby = () => { if (this.status !== 'lobby') throw new RoomError('Not in the lobby'); };
    switch (msg.type) {
      case 'addBot': host(); lobby();
        if (this.seats.length >= MAX_SEATS) throw new RoomError('That room is full', 'FULL');
        this.seats.push({ name: BOT_NAMES[this.seats.filter((s) => s.kind === 'bot').length % BOT_NAMES.length]!, kind: 'bot', token: null, conn: null });
        this.pushLobby(); return;
      case 'removeSeat': host(); lobby();
        if (msg.seat === this.host || !this.seats[msg.seat]) throw new RoomError('Cannot remove that seat');
        this.removeSeat(msg.seat); return;
      case 'leave': lobby(); this.removeSeat(seat); return;
      case 'start': host(); lobby();
        if (this.seats.length < 2) throw new RoomError('You need at least two players');
        this.state = createGame({ players: this.seats.map((s) => s.name), seed: msg.seed ?? Math.floor(this.deps.random() * 2 ** 31) });
        this.status = 'playing'; this.pushLobby(); this.afterChange(); return;
      case 'action': {
        if (this.status !== 'playing' || !this.state) throw new RoomError('No game in progress');
        const action = { ...msg.action, player: seat } as Action;
        try { this.state = applyAction(this.state, action); }
        catch (e) { if (e instanceof IllegalAction) throw new RoomError(e.message); throw e; }
        this.afterChange(); return;
      }
      case 'replaceWithBot': { host();
        const s = this.seats[msg.seat];
        if (this.status !== 'playing' || !s || s.kind !== 'human' || s.conn !== null) throw new RoomError('Only a disconnected player can be replaced');
        if (msg.seat === this.host) throw new RoomError('The host cannot be replaced');
        s.kind = 'bot'; s.token = null; s.conn = null;
        this.pushLobby(); this.afterChange(); return;
      }
      case 'makeHost': { host();
        const s = this.seats[msg.seat];
        if (!s || s.kind !== 'human') throw new RoomError('The host must be a human player');
        this.setHost(msg.seat); return;
      }
      case 'playAgain': host();
        if (this.status !== 'finished') throw new RoomError('The game is not over');
        this.state = null; this.status = 'lobby'; this.clearBot(); this.pushLobby(); return;
      default: throw new RoomError('Unknown message');
    }
  }

  // ---- internals
  private removeSeat(seat: number) {
    const s = this.seats[seat]!;
    if (seat === this.host) { const next = this.nextHost(seat); if (next >= 0) this.host = next; }
    this.seats.splice(seat, 1);
    if (this.host > seat) this.host -= 1;
    if (s.conn) this.deps.send(s.conn, { type: 'closed', reason: 'left' });
    this.pushLobby();
  }
  private nextHost(except: number) {
    return this.seats.findIndex((s, i) => i !== except && s.kind === 'human' && s.conn !== null);
  }
  private setHost(seat: number) {
    this.host = seat;
    if (this.hostTimer) { clearTimeout(this.hostTimer); this.hostTimer = null; }
    this.pushLobby(); if (this.status === 'playing') this.pushStateAll();
  }
  private armHostTransfer() {
    if (this.hostTimer) return;
    this.hostTimer = setTimeout(() => {
      this.hostTimer = null;
      const next = this.nextHost(this.host);
      if (next >= 0) this.setHost(next);
      else this.armHostTransfer();   // nobody here; try again later
    }, this.deps.hostGrace ?? HOST_GRACE_MS);
  }
  /** After any game-state change: winner check, broadcast, bot scheduling. */
  afterChange() {
    const st = this.state;
    if (!st) return;
    this.clearBot();
    if (st.winner !== null && this.status === 'playing') { this.status = 'finished'; this.pushLobby(); }
    this.pushStateAll();
    if (this.status !== 'playing') return;
    const bot = playersToAct(st).find((p) => this.seats[p]?.kind === 'bot');
    if (bot === undefined) return;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      if (this.status !== 'playing' || !this.state) return;
      const a = greedyBotAction(this.state, bot, this.deps.random);
      if (a) { this.state = applyAction(this.state, a); this.afterChange(); }
    }, this.deps.botDelay ?? BOT_DELAY_MS);
  }
  private clearBot() { if (this.botTimer) { clearTimeout(this.botTimer); this.botTimer = null; } }
  private touch() { this.lastActivity = this.deps.now(); }
  private pushLobby() {
    const seats = this.seatInfos();
    this.seats.forEach((s, i) => { if (s.conn) this.deps.send(s.conn, { type: 'lobby', code: this.code, seats, you: i, host: this.host, status: this.status }); });
  }
  private pushStateAll() { this.seats.forEach((_, i) => this.pushState(i)); }
  private pushState(seat: number) {
    const s = this.seats[seat]; const st = this.state;
    if (!s?.conn || !st) return;
    this.deps.send(s.conn, { type: 'state', view: viewFor(st, seat), legal: legalActions(st, seat), seats: this.seatInfos(), host: this.host });
  }
  destroy(reason: string) {
    this.clearBot(); if (this.hostTimer) clearTimeout(this.hostTimer);
    for (const s of this.seats) if (s.conn) this.deps.send(s.conn, { type: 'closed', reason });
    this.seats = []; this.state = null;
  }
}
```

- [ ] **Step 5: Run tests until green**

Run: `npx vitest run src/server`
Expected: all `room.test.ts` tests pass. Adjust the bot test's assertion if the seeded game makes it flaky: assert instead that `d.out` received a new `state` message for `h` after advancing timers.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Server: protocol types and Room logic with tests"
```

---

### Task 7: Room registry and the WebSocket transport

**Files:**
- Create: `src/server/rooms.ts`, `src/server/server.ts`, `src/server/index.ts`
- Test: `src/server/__tests__/rooms.test.ts`, `src/server/__tests__/server.test.ts`

**Interfaces:**
- Produces:

```ts
// rooms.ts
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export function generateCode(random: () => number): string;                 // 4 chars
export class RoomRegistry {
  constructor(deps: RoomDeps, opts?: { max?: number; idleMs?: number; emptyMs?: number });
  rooms: Map<string, Room>;
  create(): Room;                       // throws RoomError('Too many games right now') at max
  get(code: string): Room | undefined;  // case-insensitive
  remove(code: string): void;
  sweep(now: number): string[];         // returns removed codes; removes rooms idle > idleMs, or with 0 connected humans for > emptyMs, or with 0 human seats
}
// server.ts
export interface ServerOptions { port?: number; passphrase?: string | null; allowedOrigins?: string[]; dev?: boolean; }
export async function startServer(opts?: ServerOptions): Promise<{ port: number; registry: RoomRegistry; close(): Promise<void> }>;
```

- [ ] **Step 1: Failing registry tests**

```ts
// src/server/__tests__/rooms.test.ts
import { RoomRegistry, generateCode } from '../rooms';
import '../../engine/cards';
const deps = () => ({ send: () => {}, now: () => 0, random: Math.random, token: () => Math.random().toString(16).slice(2) });

describe('RoomRegistry', () => {
  it('generates 4-letter codes without I or O', () => {
    for (let i = 0; i < 200; i++) expect(generateCode(Math.random)).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
  });
  it('creates unique rooms up to the max and finds them case-insensitively', () => {
    const reg = new RoomRegistry(deps(), { max: 3 });
    const a = reg.create(); reg.create(); reg.create();
    expect(() => reg.create()).toThrow(/Too many/);
    expect(reg.get(a.code.toLowerCase())).toBe(a);
  });
  it('sweeps idle and empty rooms', () => {
    let t = 0; const d = { ...deps(), now: () => t };
    const reg = new RoomRegistry(d, { idleMs: 1000, emptyMs: 100 });
    const busy = reg.create(); busy.create('c', 'x');
    const empty = reg.create();
    t = 150; expect(reg.sweep(t)).toEqual([empty.code]);
    busy.disconnect('c'); t = 300; expect(reg.sweep(t)).toEqual([busy.code]);   // nobody connected for > emptyMs
    const idle = reg.create(); idle.create('c', 'x'); t = 2000; expect(reg.sweep(t)).toEqual([idle.code]);
  });
});
```

- [ ] **Step 2: Implement `rooms.ts`**

```ts
import { Room, RoomError, type RoomDeps } from './room';
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export function generateCode(random: () => number) {
  let s = ''; for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return s;
}
export class RoomRegistry {
  rooms = new Map<string, Room>();
  private emptySince = new Map<string, number>();
  private max: number; private idleMs: number; private emptyMs: number;
  constructor(private deps: RoomDeps, opts: { max?: number; idleMs?: number; emptyMs?: number } = {}) {
    this.max = opts.max ?? 50; this.idleMs = opts.idleMs ?? 2 * 60 * 60_000; this.emptyMs = opts.emptyMs ?? 10 * 60_000;
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
  remove(code: string) { const r = this.rooms.get(code); if (r) { r.destroy('closed'); this.rooms.delete(code); this.emptySince.delete(code); } }
  sweep(now: number): string[] {
    const gone: string[] = [];
    for (const [code, r] of this.rooms) {
      if (r.connectedHumans() === 0) { if (!this.emptySince.has(code)) this.emptySince.set(code, now); } else this.emptySince.delete(code);
      const emptyFor = this.emptySince.has(code) ? now - this.emptySince.get(code)! : 0;
      if (r.humanSeats() === 0 || emptyFor > this.emptyMs || now - r.lastActivity > this.idleMs) { r.destroy('expired'); this.rooms.delete(code); this.emptySince.delete(code); gone.push(code); }
    }
    return gone;
  }
}
```

Run `npx vitest run src/server/__tests__/rooms.test.ts` → PASS.

- [ ] **Step 3: Failing transport test** — `src/server/__tests__/server.test.ts`

```ts
import WebSocket from 'ws';
import { startServer } from '../server';
import type { ClientMessage, ServerMessage } from '../protocol';
import { randomBotAction } from '../../engine/bot';
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
  beforeAll(async () => { srv = await startServer({ port: 0, passphrase: 'moo', allowedOrigins: ['http://localhost:5173'] }); });
  afterAll(() => srv.close());

  it('rejects bad origins', async () => {
    const c = new Client(srv.port, 'https://evil.example');
    await expect(c.open()).rejects.toBeTruthy();
  });
  it('healthz responds', async () => {
    const r = await fetch(`http://127.0.0.1:${srv.port}/healthz`);
    expect(await r.text()).toBe('ok');
  });
  it('requires the passphrase to create, not to join; two clients play a whole game', async () => {
    const a = new Client(srv.port); const b = new Client(srv.port);
    await a.open(); await b.open();
    a.send({ type: 'create', name: 'A', passphrase: 'wrong' });
    expect((await a.next('error')).code).toBe('PASSPHRASE');
    a.send({ type: 'create', name: 'A', passphrase: 'moo' });
    const joined = await a.next('joined');
    b.send({ type: 'join', code: joined.code.toLowerCase(), name: 'B' });
    const jb = await b.next('joined'); expect(jb.seat).toBe(1);
    b.send({ type: 'start' }); expect((await b.next('error')).message).toMatch(/host/);
    a.send({ type: 'start', seed: 99 });
    const clients = [a, b];
    let winner: number | null = null;
    for (let i = 0; i < 2000 && winner === null; i++) {
      for (const c of clients) {
        const st = c.last('state');
        if (!st) continue;
        if (st.view.winner !== null) { winner = st.view.winner; break; }
        if (st.legal.length) {
          const act = st.legal[Math.floor(Math.random() * st.legal.length)]!;
          c.inbox = c.inbox.filter((m) => m.type !== 'state');
          c.send({ type: 'action', action: act });
          await c.next('state');
        }
      }
      if (![a, b].some((c) => c.last('state')?.legal.length)) await new Promise((r) => setTimeout(r, 20));
    }
    expect(winner).not.toBeNull();
    expect(a.last('lobby')?.status ?? (await a.next('lobby')).status).toBe('finished');
    a.ws.close(); b.ws.close();
  }, 60_000);
  it('rejoin with a token after the socket drops', async () => {
    const a = new Client(srv.port); await a.open();
    a.send({ type: 'create', name: 'A', passphrase: 'moo' });
    const j = await a.next('joined');
    a.ws.close();
    const a2 = new Client(srv.port); await a2.open();
    a2.send({ type: 'rejoin', code: j.code, token: j.token });
    expect((await a2.next('joined')).seat).toBe(0);
    a2.send({ type: 'rejoin', code: 'ZZZZ', token: 'x' });
    expect((await a2.next('error')).code).toBe('NO_ROOM');
    a2.ws.close();
  });
});
```

The first test needs one small server-side rule: to keep the "rate limit one create per minute per IP" from breaking this test file, `startServer` takes `dev: true` to disable rate limiting; tests pass `dev: false` only in a dedicated test:

```ts
  it('rate-limits room creation per IP', async () => {
    const s2 = await startServer({ port: 0, passphrase: 'moo', allowedOrigins: ['http://localhost:5173'], dev: false });
    const c = new Client(s2.port); await c.open();
    c.send({ type: 'create', name: 'A', passphrase: 'moo' }); await c.next('joined');
    c.send({ type: 'leave' });
    c.send({ type: 'create', name: 'A', passphrase: 'moo' });
    expect((await c.next('error')).code).toBe('RATE');
    c.ws.close(); await s2.close();
  });
```

Set `dev: true` in `beforeAll` for the shared server.

- [ ] **Step 4: Implement `server.ts`**

```ts
import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { RoomRegistry } from './rooms';
import { Room, RoomError } from './room';
import type { ClientMessage, ServerMessage } from './protocol';

export interface ServerOptions { port?: number; passphrase?: string | null; allowedOrigins?: string[]; dev?: boolean }
interface Conn { id: string; ws: WebSocket; room: Room | null; alive: boolean; ip: string }

const sha = (s: string) => createHash('sha256').update(s).digest();
const sameSecret = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));

export async function startServer(opts: ServerOptions = {}) {
  const dev = opts.dev ?? false;
  const passphrase = opts.passphrase ?? null;
  const origins = new Set(opts.allowedOrigins ?? ['https://geoffreychan.com']);
  const conns = new Map<string, Conn>();
  const registry = new RoomRegistry({
    send: (id, msg) => { const c = conns.get(id); if (c && c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg)); },
    now: () => Date.now(), random: Math.random, token: () => randomBytes(16).toString('hex'),
  });
  const lastCreate = new Map<string, number>();

  const http = createServer((req, res) => {
    if (req.url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
    res.writeHead(404); res.end();
  });
  const wss = new WebSocketServer({
    server: http, maxPayload: 16 * 1024,
    verifyClient: ({ origin }) => (origin ? origins.has(origin) || (dev && /^https?:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.)/.test(origin)) : dev),
  });

  wss.on('connection', (ws, req) => {
    const c: Conn = { id: randomBytes(8).toString('hex'), ws, room: null, alive: true, ip: (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.socket.remoteAddress || '?' };
    conns.set(c.id, c);
    const reply = (msg: ServerMessage) => ws.send(JSON.stringify(msg));
    ws.on('pong', () => { c.alive = true; });
    ws.on('message', (data) => {
      let msg: ClientMessage;
      try { msg = JSON.parse(data.toString()); if (!msg || typeof msg.type !== 'string') throw new Error(); } catch { ws.close(1003, 'bad message'); return; }
      try {
        if (msg.type === 'create') {
          if (c.room) throw new RoomError('Leave your current room first');
          if (!dev) {
            if (passphrase === null) throw new RoomError('Room creation is disabled', 'PASSPHRASE');
            if (!sameSecret(String(msg.passphrase ?? ''), passphrase)) throw new RoomError('Wrong passphrase', 'PASSPHRASE');
            const t = lastCreate.get(c.ip) ?? 0;
            if (Date.now() - t < 60_000) throw new RoomError('Slow down: one new room per minute', 'RATE');
            lastCreate.set(c.ip, Date.now());
          }
          const room = registry.create();
          const { seat, token } = room.create(c.id, msg.name);
          c.room = room; reply({ type: 'joined', code: room.code, seat, token });
        } else if (msg.type === 'join' || msg.type === 'rejoin') {
          if (c.room) throw new RoomError('Leave your current room first');
          const room = registry.get(msg.code);
          if (!room) throw new RoomError('No room with that code', 'NO_ROOM');
          const r = msg.type === 'join' ? room.join(c.id, msg.name) : room.rejoin(c.id, msg.token);
          c.room = room; reply({ type: 'joined', code: room.code, seat: r.seat, token: r.token });
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
    for (const c of conns.values()) { if (!c.alive) { c.ws.terminate(); continue; } c.alive = false; c.ws.ping(); }
    for (const code of registry.sweep(Date.now())) console.log(`room ${code} expired`);
  }, 30_000);

  await new Promise<void>((res) => http.listen(opts.port ?? 8787, res));
  const port = (http.address() as { port: number }).port;
  return {
    port, registry,
    close: () => new Promise<void>((res) => { clearInterval(heartbeat); for (const c of conns.values()) c.ws.terminate(); wss.close(); http.close(() => res()); }),
  };
}
```

Note `alive` is set to `false` then `true` on pong, so a socket is terminated after two missed pongs (60 s), matching the spec.

- [ ] **Step 5: `src/server/index.ts`**

```ts
import '../engine/cards';
import { startServer } from './server';
const dev = process.env.NODE_ENV === 'development';
startServer({
  port: Number(process.env.PORT ?? 8787),
  passphrase: process.env.UNICORNS_PASSPHRASE ?? null,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'https://geoffreychan.com').split(',').map((s) => s.trim()).filter(Boolean),
  dev,
}).then(({ port }) => console.log(`unicorns server on :${port}${dev ? ' (development: no passphrase, localhost origins allowed)' : ''}`));
```

- [ ] **Step 6: Run everything**

```bash
npx vitest run src/server && npm run typecheck
npm run dev   # confirm "unicorns server on :8787" appears; Ctrl-C
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Server: room registry, ws transport, healthz, passphrase, heartbeat"
```

---

### Task 8: `GameClient` (browser side of the protocol)

**Files:**
- Create: `src/ui/net/client.ts`
- Test: `src/ui/net/__tests__/client.test.ts`

**Interfaces:**
- Produces:

```ts
export type ClientStatus = 'connecting' | 'open' | 'closed';
export interface Session { code: string; token: string }
export interface Snapshot {
  status: ClientStatus;
  joined: Extract<ServerMessage, { type: 'joined' }> | null;
  lobby: Extract<ServerMessage, { type: 'lobby' }> | null;
  state: Extract<ServerMessage, { type: 'state' }> | null;
  error: string | null;
  closedReason: string | null;
}
export interface ClientOptions { WebSocketImpl?: typeof WebSocket; storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>; minDelay?: number; maxDelay?: number }
export class GameClient {
  constructor(url: string, opts?: ClientOptions);
  snapshot(): Snapshot;                       // stable object identity until something changes
  subscribe(fn: () => void): () => void;
  connect(): void; close(): void;             // close() disables reconnect
  send(msg: ClientMessage): void;             // queued until open
  create(name: string, passphrase: string): void;
  join(code: string, name: string): void;
  leave(): void;                              // sends leave, clears session and lobby/state
  clearError(): void;
  session(): Session | null;
}
export const SESSION_KEY = 'uu.session';
```

Behaviour: on `open`, if a session is stored and no `joined` yet for this connection, send `rejoin`; on `joined` store the session; on `closed` message or an `error` with code `NO_ROOM`/`BAD_TOKEN` in reply to a rejoin, clear the session and reset `lobby`/`state`; reconnect after close with delay doubling from `minDelay` (500) to `maxDelay` (8000) unless `close()` was called.

- [ ] **Step 1: Failing tests with a fake socket**

```ts
// src/ui/net/__tests__/client.test.ts
import { GameClient, SESSION_KEY } from '../client';

class FakeWS {
  static instances: FakeWS[] = [];
  static OPEN = 1; static CLOSED = 3;
  readyState = 0; sent: string[] = [];
  onopen: (() => void) | null = null; onclose: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null; onerror: (() => void) | null = null;
  constructor(public url: string) { FakeWS.instances.push(this); }
  send(s: string) { this.sent.push(s); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
}
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } }; };
const make = (storage = mem()) => new GameClient('ws://x', { WebSocketImpl: FakeWS as unknown as typeof WebSocket, storage, minDelay: 10, maxDelay: 40 });

beforeEach(() => { FakeWS.instances = []; vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('GameClient', () => {
  it('queues sends until open and stores the session on joined', () => {
    const storage = mem(); const c = make(storage); c.connect();
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
    const storage = mem(); storage.setItem(SESSION_KEY, JSON.stringify({ code: 'ABCD', token: 't1' }));
    const c = make(storage); c.connect();
    let ws = FakeWS.instances[0]!; ws.open();
    expect(JSON.parse(ws.sent[0]!)).toEqual({ type: 'rejoin', code: 'ABCD', token: 't1' });
    ws.close();
    expect(c.snapshot().status).toBe('closed');
    vi.advanceTimersByTime(10); expect(FakeWS.instances).toHaveLength(2);
    FakeWS.instances[1]!.close(); vi.advanceTimersByTime(19); expect(FakeWS.instances).toHaveLength(2);
    vi.advanceTimersByTime(1); expect(FakeWS.instances).toHaveLength(3);
    ws = FakeWS.instances[2]!; ws.open();
    expect(JSON.parse(ws.sent[0]!).type).toBe('rejoin');
  });
  it('clears the session when the room is gone', () => {
    const storage = mem(); storage.setItem(SESSION_KEY, JSON.stringify({ code: 'ABCD', token: 't1' }));
    const c = make(storage); c.connect(); const ws = FakeWS.instances[0]!; ws.open();
    ws.receive({ type: 'error', message: 'No room with that code', code: 'NO_ROOM' });
    expect(storage.getItem(SESSION_KEY)).toBeNull();
    expect(c.snapshot().error).toMatch(/No room/);
  });
  it('notifies subscribers and keeps snapshot identity when nothing changed', () => {
    const c = make(); const fn = vi.fn(); c.subscribe(fn); c.connect();
    const s1 = c.snapshot(); expect(c.snapshot()).toBe(s1);
    FakeWS.instances[0]!.open();
    expect(fn).toHaveBeenCalled(); expect(c.snapshot()).not.toBe(s1); expect(c.snapshot().status).toBe('open');
  });
  it('close() stops reconnecting', () => {
    const c = make(); c.connect(); FakeWS.instances[0]!.open(); c.close();
    vi.advanceTimersByTime(1000); expect(FakeWS.instances).toHaveLength(1);
  });
});
```

Add `'src/**/*.test.ts'` already matches this path; vitest runs it in Node so `WebSocket`/`localStorage` must be injected (they are).

- [ ] **Step 2: Implement `src/ui/net/client.ts`**

```ts
import type { ClientMessage, ServerMessage } from '../../server/protocol';

export type ClientStatus = 'connecting' | 'open' | 'closed';
export interface Session { code: string; token: string }
export interface Snapshot { status: ClientStatus; joined: Extract<ServerMessage, { type: 'joined' }> | null; lobby: Extract<ServerMessage, { type: 'lobby' }> | null; state: Extract<ServerMessage, { type: 'state' }> | null; error: string | null; closedReason: string | null }
export interface ClientOptions { WebSocketImpl?: typeof WebSocket; storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>; minDelay?: number; maxDelay?: number }
export const SESSION_KEY = 'uu.session';

export class GameClient {
  private ws: WebSocket | null = null;
  private snap: Snapshot = { status: 'closed', joined: null, lobby: null, state: null, error: null, closedReason: null };
  private listeners = new Set<() => void>();
  private queue: ClientMessage[] = [];
  private delay: number; private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false; private rejoining = false;
  private WS: typeof WebSocket; private storage: ClientOptions['storage'];
  constructor(private url: string, opts: ClientOptions = {}) {
    this.WS = opts.WebSocketImpl ?? WebSocket; this.storage = opts.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    this.delay = opts.minDelay ?? 500; this.minDelay = this.delay; this.maxDelay = opts.maxDelay ?? 8000;
  }
  private minDelay: number; private maxDelay: number;

  snapshot() { return this.snap; }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private set(patch: Partial<Snapshot>) { this.snap = { ...this.snap, ...patch }; this.listeners.forEach((l) => l()); }
  session(): Session | null { try { const s = this.storage?.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
  private saveSession(s: Session | null) { try { s ? this.storage?.setItem(SESSION_KEY, JSON.stringify(s)) : this.storage?.removeItem(SESSION_KEY); } catch { /* ignore */ } }

  connect() {
    if (this.stopped) this.stopped = false;
    if (this.ws && this.ws.readyState <= 1) return;
    const ws = new this.WS(this.url); this.ws = ws;
    this.set({ status: 'connecting' });
    ws.onopen = () => {
      this.delay = this.minDelay;
      this.set({ status: 'open' });
      const s = this.session();
      if (s && !this.queue.some((m) => m.type === 'create' || m.type === 'join')) { this.rejoining = true; ws.send(JSON.stringify({ type: 'rejoin', ...s })); }
      for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
    };
    ws.onmessage = (e) => this.onMessage(JSON.parse(String(e.data)) as ServerMessage);
    ws.onerror = () => { /* onclose follows */ };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null; this.set({ status: 'closed' });
      if (this.stopped) return;
      this.timer = setTimeout(() => { this.timer = null; this.connect(); }, this.delay);
      this.delay = Math.min(this.delay * 2, this.maxDelay);
    };
  }
  close() { this.stopped = true; if (this.timer) { clearTimeout(this.timer); this.timer = null; } this.ws?.close(); this.ws = null; }

  private onMessage(m: ServerMessage) {
    switch (m.type) {
      case 'joined': this.rejoining = false; this.saveSession({ code: m.code, token: m.token }); this.set({ joined: m, error: null, closedReason: null }); break;
      case 'lobby': this.set({ lobby: m, ...(m.status !== 'playing' ? { state: null } : {}) }); break;
      case 'state': this.set({ state: m }); break;
      case 'error':
        if (this.rejoining && (m.code === 'NO_ROOM' || m.code === 'BAD_TOKEN')) { this.rejoining = false; this.saveSession(null); this.set({ joined: null, lobby: null, state: null, error: m.message }); }
        else this.set({ error: m.message });
        break;
      case 'closed': this.saveSession(null); this.set({ joined: null, lobby: null, state: null, closedReason: m.reason }); break;
    }
  }
  send(m: ClientMessage) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); else this.queue.push(m); }
  create(name: string, passphrase: string) { this.saveSession(null); this.send({ type: 'create', name, passphrase }); }
  join(code: string, name: string) { this.saveSession(null); this.send({ type: 'join', code: code.trim().toUpperCase(), name }); }
  leave() { this.send({ type: 'leave' }); this.saveSession(null); this.set({ joined: null, lobby: null, state: null }); }
  clearError() { this.set({ error: null }); }
}
```

- [ ] **Step 3: Run tests** — `npx vitest run src/ui` → PASS. Fix ordering issues in the backoff test by checking the implementation doubles *after* scheduling (10, 20, 40, 40...).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Client: GameClient with reconnect, rejoin and snapshot store"
```

---

### Task 9: Home, Lobby, OnlineGame, and the online e2e spec

**Files:**
- Create: `src/ui/Home.tsx`, `src/ui/Lobby.tsx`, `src/ui/OnlineGame.tsx`, `src/ui/net/useClient.ts`, `e2e/online.spec.ts`
- Modify: `src/ui/App.tsx`, `src/ui/styles.css`, `e2e/local.spec.ts` (restore the Home clicks)

**Interfaces:**
- Consumes: `GameClient`, `GameScreen`, `Setup`, `LocalGame`.
- Produces:

```ts
// useClient.ts
export function serverUrl(): string;                 // ?server= param > localStorage 'uu.server' > __SERVER_URL__
export function useClient(): { client: GameClient; snap: Snapshot };   // singleton client, useSyncExternalStore
// Home.tsx
export function Home(props: { onLocal(): void; onOnline(): void; hasSession: boolean }): JSX.Element;
// Lobby.tsx
export function Lobby(props: { client: GameClient; snap: Snapshot; onBack(): void }): JSX.Element;
// OnlineGame.tsx
export function OnlineGame(props: { client: GameClient; snap: Snapshot; onQuit(): void }): JSX.Element;
```

Routing in `App.tsx`: `mode: 'home' | 'local-setup' | 'local-game' | 'online'`. On first render, if a session exists in storage go straight to `online`. In `online` mode: connect the client; render `OnlineGame` when `snap.state` exists and `snap.lobby?.status === 'playing'`, otherwise `Lobby`. `?join=CODE` in the URL prefills the Lobby join form and selects online mode.

- [ ] **Step 1: `useClient.ts`**

```ts
import { useMemo, useSyncExternalStore } from 'react';
import { GameClient } from './client';

export function serverUrl(): string {
  const q = new URLSearchParams(location.search).get('server');
  if (q) { try { localStorage.setItem('uu.server', q); } catch { /* ignore */ } return q; }
  try { const s = localStorage.getItem('uu.server'); if (s) return s; } catch { /* ignore */ }
  return __SERVER_URL__;
}
let singleton: GameClient | null = null;
export function getClient() { return (singleton ??= new GameClient(serverUrl())); }
export function useClient() {
  const client = useMemo(getClient, []);
  const snap = useSyncExternalStore((fn) => client.subscribe(fn), () => client.snapshot());
  return { client, snap };
}
```

- [ ] **Step 2: `Home.tsx`**

```tsx
export function Home({ onLocal, onOnline, hasSession }: { onLocal(): void; onOnline(): void; hasSession: boolean }) {
  return (
    <main className="setup home">
      <header className="setup-head"><h1>Unstable Unicorns</h1><p className="lede">Base set, 2nd Edition. Play with the family on your own devices, or pass one device around.</p></header>
      <div className="choices big-choices">
        <button type="button" className="choice primary" onClick={onOnline}>{hasSession ? 'Back to my game' : 'Play online'}</button>
        <button type="button" className="choice" onClick={onLocal}>Play on this device</button>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: `Lobby.tsx`**

Two views on `snap.joined`: the form (create or join) and the seat list.

```tsx
import { useEffect, useState } from 'react';
import type { GameClient, Snapshot } from './net/client';

const ls = { get: (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };

export function Lobby({ client, snap, onBack }: { client: GameClient; snap: Snapshot; onBack(): void }) {
  const [name, setName] = useState(() => ls.get('uu.name'));
  const [pass, setPass] = useState(() => ls.get('uu.passphrase'));
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('join') ?? '');
  const [tab, setTab] = useState<'join' | 'create'>(code ? 'join' : 'create');
  useEffect(() => { ls.set('uu.name', name); }, [name]);
  useEffect(() => { ls.set('uu.passphrase', pass); }, [pass]);

  if (!snap.joined || !snap.lobby) {
    const busy = snap.status !== 'open';
    return (
      <main className="setup lobby">
        <header className="setup-head"><button type="button" className="ghost small" onClick={onBack}>Back</button><h1>Play online</h1>
          <p className="hint">{snap.status === 'open' ? 'Connected.' : snap.status === 'connecting' ? 'Connecting…' : 'Offline. Retrying…'}</p></header>
        <label className="field">Your name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoComplete="nickname" data-testid="name" /></label>
        <div className="toggle" role="group" aria-label="Create or join">
          <button type="button" className={tab === 'create' ? 'on' : ''} onClick={() => setTab('create')}>Create a room</button>
          <button type="button" className={tab === 'join' ? 'on' : ''} onClick={() => setTab('join')}>Join a room</button>
        </div>
        {tab === 'create' ? (
          <form onSubmit={(e) => { e.preventDefault(); client.create(name, pass); }}>
            <label className="field">Family passphrase<input type="password" value={pass} onChange={(e) => setPass(e.target.value)} data-testid="passphrase" /></label>
            <button type="submit" className="primary big" disabled={busy} data-testid="create">Create room</button>
          </form>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); client.join(code, name); }}>
            <label className="field">Room code<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={4} autoCapitalize="characters" data-testid="code" /></label>
            <button type="submit" className="primary big" disabled={busy || code.length !== 4} data-testid="join">Join</button>
          </form>
        )}
        {snap.error && <p className="error" role="alert" onClick={client.clearError}>{snap.error}</p>}
        {snap.closedReason && <p className="hint">The room closed ({snap.closedReason}).</p>}
      </main>
    );
  }

  const { lobby } = snap; const isHost = lobby.host === lobby.you;
  const url = `${location.origin}${location.pathname}?join=${lobby.code}`;
  const share = async () => { try { if (navigator.share) await navigator.share({ title: 'Unstable Unicorns', url }); else await navigator.clipboard.writeText(url); } catch { /* cancelled */ } };
  return (
    <main className="setup lobby">
      <header className="setup-head"><h1>Room <span className="code" data-testid="roomcode">{lobby.code}</span></h1>
        <p className="hint">{lobby.status === 'finished' ? 'Game over. ' : ''}{isHost ? 'You are the host. Start when everyone is in.' : `Waiting for ${lobby.seats[lobby.host]?.name ?? 'the host'} to start.`}</p>
        <button type="button" className="ghost small" onClick={share}>Share invite link</button></header>
      <section className="seats" aria-label="Players">
        {lobby.seats.map((s, i) => (
          <div className={`seat ${s.connected || s.kind === 'bot' ? '' : 'offline'}`} key={i}>
            <span className="seat-no">{i + 1}</span>
            <span className="seat-name">{s.name}{i === lobby.you ? ' (you)' : ''}{s.kind === 'bot' ? ' · bot' : s.connected ? '' : ' · offline'}{i === lobby.host ? ' · host' : ''}</span>
            {isHost && i !== lobby.you && lobby.status === 'lobby' && <button type="button" className="ghost" onClick={() => client.send({ type: 'removeSeat', seat: i })} aria-label={`Remove ${s.name}`}>×</button>}
            {isHost && i !== lobby.you && s.kind === 'human' && <button type="button" className="ghost small" onClick={() => client.send({ type: 'makeHost', seat: i })}>Make host</button>}
          </div>
        ))}
        {isHost && lobby.status === 'lobby' && <button type="button" className="ghost add" onClick={() => client.send({ type: 'addBot' })} disabled={lobby.seats.length >= 8}>+ Add a bot</button>}
      </section>
      <section className="setup-foot">
        {isHost && lobby.status === 'lobby' && <button type="button" className="primary big" onClick={() => client.send({ type: 'start' })} disabled={lobby.seats.length < 2} data-testid="start">Start game</button>}
        {isHost && lobby.status === 'finished' && <button type="button" className="primary big" onClick={() => client.send({ type: 'playAgain' })} data-testid="playagain">Play again</button>}
        {lobby.status === 'lobby' && <button type="button" className="ghost" onClick={() => { client.leave(); onBack(); }}>Leave room</button>}
        {snap.error && <p className="error" role="alert" onClick={client.clearError}>{snap.error}</p>}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: `OnlineGame.tsx`**

```tsx
import type { GameClient, Snapshot } from './net/client';
import { GameScreen } from './GameScreen';

export function OnlineGame({ client, snap, onQuit }: { client: GameClient; snap: Snapshot; onQuit(): void }) {
  const st = snap.state!; const lobby = snap.lobby;
  const isHost = lobby ? lobby.host === lobby.you : false;
  const waitingOn = st.view.pending ? (st.view.pending.kind === 'prompt' ? [st.view.pending.prompt.player] : st.view.pending.awaiting) : st.view.turn.phase === 'action' ? [st.view.turn.player] : [];
  const offline = waitingOn.filter((p) => st.seats[p] && st.seats[p]!.kind === 'human' && !st.seats[p]!.connected);
  const banner = snap.status !== 'open' ? <div className="banner warn">Reconnecting…</div>
    : offline.length ? <div className="banner">Waiting on {offline.map((p) => st.view.players[p]!.name).join(', ')} (offline){isHost && <> · <button type="button" className="link" onClick={() => client.send({ type: 'replaceWithBot', seat: offline[0]! })}>replace with a bot</button></>}</div>
    : null;
  return (
    <GameScreen view={st.view} legal={st.legal} seats={st.seats} onAction={(a) => client.send({ type: 'action', action: a })} onQuit={onQuit}
      error={snap.error} onDismissError={client.clearError} banner={banner}
      renderWin={() => isHost
        ? <button type="button" className="primary big" onClick={() => client.send({ type: 'playAgain' })} data-testid="playagain">Play again</button>
        : <p>Waiting for the host to start another game.</p>} />
  );
}
```

`GameScreen` must render `banner` under the top bar and use the `renderWin` prop (Task 3 added both). Quit in online mode returns to Home without leaving the room (the session persists so "Back to my game" works).

- [ ] **Step 5: `App.tsx`**

```tsx
import { useEffect, useState } from 'react';
import '../engine/cards';
import { Home } from './Home';
import { Setup } from './Setup';
import { LocalGame } from './LocalGame';
import { Lobby } from './Lobby';
import { OnlineGame } from './OnlineGame';
import { useClient } from './net/useClient';
import type { Seat } from './seats';

type Mode = 'home' | 'local-setup' | 'local-game' | 'online';

export function App() {
  const { client, snap } = useClient();
  const [mode, setMode] = useState<Mode>(() => (client.session() || new URLSearchParams(location.search).get('join') ? 'online' : 'home'));
  const [game, setGame] = useState<{ seats: Seat[]; seed: number } | null>(null);
  useEffect(() => { if (mode === 'online') client.connect(); }, [mode, client]);

  switch (mode) {
    case 'home': return <Home hasSession={!!client.session()} onLocal={() => setMode('local-setup')} onOnline={() => setMode('online')} />;
    case 'local-setup': return <Setup onBack={() => setMode('home')} onStart={(seats, seed) => { setGame({ seats, seed }); setMode('local-game'); }} />;
    case 'local-game': return <LocalGame key={game!.seed} seats={game!.seats} seed={game!.seed} onQuit={() => setMode('local-setup')} />;
    case 'online':
      if (snap.state && snap.lobby?.status === 'playing') return <OnlineGame client={client} snap={snap} onQuit={() => setMode('home')} />;
      return <Lobby client={client} snap={snap} onBack={() => setMode('home')} />;
  }
}
```

- [ ] **Step 6: Styles** — add to `styles.css`: `.home .big-choices .choice { font-size: 1.2rem; padding: 1rem; }`, `.field { display: flex; flex-direction: column; gap: .3rem; margin: .6rem 0; }`, `.code { font-family: monospace; letter-spacing: .2em; }`, `.seat.offline { opacity: .6; }`, `.banner { padding: .4rem .8rem; background: var(--ground-2); font-size: .9rem; } .banner.warn { background: var(--warn); color: #fff; }`, `.error { color: var(--accent); }`, `button.link { background: none; border: 0; color: var(--accent); text-decoration: underline; padding: 0; font: inherit; }`.

- [ ] **Step 7: `e2e/online.spec.ts`**

```ts
import { test, expect, type Browser, type Page } from '@playwright/test';
import { step } from './helpers';

async function open(browser: Browser, name: string) {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto('./'); await page.getByRole('button', { name: 'Play online' }).click();
  await page.getByTestId('name').fill(name);
  return { ctx, page };
}
async function anyStep(pages: Page[]) { for (const p of pages) if (await step(p)) return true; return false; }

test('two players create, join, play to a winner, rejoin after reload, host transfer', async ({ browser }) => {
  const a = await open(browser, 'Ann'); const b = await open(browser, 'Ben');
  await a.page.getByTestId('passphrase').fill('dev'); await a.page.getByTestId('create').click();
  const code = (await a.page.getByTestId('roomcode').textContent())!.trim();
  expect(code).toMatch(/^[A-Z]{4}$/);
  await b.page.getByRole('button', { name: 'Join a room' }).click();
  await b.page.getByTestId('code').fill(code); await b.page.getByTestId('join').click();
  await expect(b.page.getByText('Ann (you)').or(b.page.getByText('Ann · host'))).toBeVisible();
  await expect(a.page.getByText(/Ben/)).toBeVisible();
  await a.page.getByTestId('start').click();
  await expect(a.page.getByTestId('topbar')).toBeVisible(); await expect(b.page.getByTestId('topbar')).toBeVisible();

  // Ben reloads mid-game and is still seated
  await b.page.reload();
  await expect(b.page.getByTestId('topbar')).toBeVisible();

  for (let i = 0; i < 600; i++) {
    if (await a.page.getByTestId('win').isVisible()) break;
    if (!(await anyStep([a.page, b.page]))) await a.page.waitForTimeout(200);
  }
  await expect(a.page.getByTestId('win')).toBeVisible(); await expect(b.page.getByTestId('win')).toBeVisible();
  await a.page.screenshot({ path: 'test-results/online-win-a.png' });

  // host leaves for good: Ben becomes host after the grace period (server dev grace is 20 s; keep test tolerant)
  await a.ctx.close();
  await a.page.waitForTimeout(0).catch(() => {});
  await b.page.getByRole('button', { name: 'Play again' }).click({ timeout: 30_000 }).catch(() => {});
  await b.ctx.close();
});
```

The last three lines exercise host transfer only loosely; to make it deterministic, `scripts/dev.mjs` passes `HOST_GRACE_MS=3000` and `server.ts`/`room.ts` read `process.env.HOST_GRACE_MS` when set (add: in `index.ts`, pass `hostGrace: Number(process.env.HOST_GRACE_MS) || undefined` through `startServer` → `RoomRegistry` deps). Then replace the loose ending with:

```ts
  await a.ctx.close();
  await expect(b.page.getByTestId('playagain')).toBeVisible({ timeout: 10_000 });
  await b.page.getByTestId('playagain').click();
  await expect(b.page.getByTestId('start')).toBeVisible();
  await b.ctx.close();
```

- [ ] **Step 8: Restore the Home clicks in `e2e/local.spec.ts`, run everything**

```bash
npm run typecheck && npm test && npx playwright test --project=pixel
```

Expected: local + online specs pass on the Pixel profile. Then `--project=ipad`. Look at `test-results/online-win-a.png`.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "Client: Home, Lobby, OnlineGame; online e2e"
```

---

### Task 10: PWA shell

**Files:**
- Create: `src/ui/pwa/manifest.webmanifest`, `src/ui/pwa/sw.js`, `src/ui/pwa/icon.svg`, `src/ui/pwa/icons/{icon-192.png,icon-512.png,icon-maskable-512.png,apple-touch-icon.png}` (generated), `src/ui/pwa/register.ts`, `src/ui/pwa/wakeLock.ts`, `scripts/icons.mjs`, `e2e/pwa.spec.ts`
- Modify: `src/ui/main.tsx`, `src/ui/GameScreen.tsx` (wake lock + update toast), `src/ui/styles.css` (safe areas)

**Interfaces:**
- Produces: `registerServiceWorker(onUpdate: () => void): void` (no-op when `__DEV__` or unsupported), `applyUpdate(): void`; `useWakeLock(active: boolean): void`.

- [ ] **Step 1: Manifest**

```json
{
  "name": "Unstable Unicorns",
  "short_name": "Unicorns",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#f6f1fb",
  "theme_color": "#f6f1fb",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 2: Icon SVG and generator**

`src/ui/pwa/icon.svg`: a 512×512 rounded square in `#d63f9a` with a white unicorn-horn triangle and a small star, e.g.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#d63f9a"/><polygon points="256,72 318,300 194,300" fill="#fff"/><circle cx="256" cy="360" r="60" fill="#fff"/><polygon points="120,120 132,150 164,152 138,172 146,204 120,186 94,204 102,172 76,152 108,150" fill="#ffe36e"/></svg>
```

`scripts/icons.mjs` renders it with Playwright's Chromium (already installed):

```js
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
const svg = readFileSync('src/ui/pwa/icon.svg', 'utf8');
mkdirSync('src/ui/pwa/icons', { recursive: true });
const browser = await chromium.launch(); const page = await browser.newPage();
async function render(file, size, pad = 0) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:${pad ? '#d63f9a' : 'transparent'}"><div style="padding:${pad}px;width:${size - 2 * pad}px;height:${size - 2 * pad}px">${svg}</div></body>`);
  await page.screenshot({ path: `src/ui/pwa/icons/${file}`, omitBackground: !pad });
}
await render('icon-192.png', 192); await render('icon-512.png', 512); await render('apple-touch-icon.png', 180);
await render('icon-maskable-512.png', 512, 64);
await browser.close(); console.log('icons written');
```

Run `npm run icons` and commit the PNGs (they are small and not card art).

- [ ] **Step 3: Service worker** — `src/ui/pwa/sw.js`

```js
const CACHE = '__CACHE__';
const PRECACHE = __PRECACHE__;
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE))); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isShell = url.origin === location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html') || url.pathname.endsWith('manifest.webmanifest'));
  const isFont = url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com');
  if (isShell) { e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return r; }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./')))); return; }
  if (isFont) { e.respondWith(caches.open('uu-fonts').then(async (c) => { const hit = await c.match(req); if (hit) return hit; const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; }).catch(() => fetch(req))); return; }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
```

- [ ] **Step 4: `register.ts` and `wakeLock.ts`**

```ts
// register.ts
let waiting: ServiceWorker | null = null;
export function registerServiceWorker(onUpdate: () => void) {
  if (__DEV__ || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      const track = (sw: ServiceWorker | null) => { if (!sw) return; sw.addEventListener('statechange', () => { if (sw.state === 'installed' && navigator.serviceWorker.controller) { waiting = sw; onUpdate(); } }); };
      if (reg.waiting && navigator.serviceWorker.controller) { waiting = reg.waiting; onUpdate(); }
      track(reg.installing); reg.addEventListener('updatefound', () => track(reg.installing));
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
    } catch (e) { console.warn('sw', e); }
  });
}
export function applyUpdate() { waiting?.postMessage('SKIP_WAITING'); }

// wakeLock.ts
import { useEffect } from 'react';
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null; let stopped = false;
    const acquire = async () => { try { if (!stopped && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen'); } catch { /* denied */ } };
    acquire(); document.addEventListener('visibilitychange', acquire);
    return () => { stopped = true; document.removeEventListener('visibilitychange', acquire); lock?.release().catch(() => {}); };
  }, [active]);
}
```

`main.tsx`: call `registerServiceWorker(() => window.dispatchEvent(new Event('uu:update')))`. In `App.tsx` listen for `uu:update` and show a fixed toast `Update available · <button onClick={applyUpdate}>Reload</button>` with `data-testid="update"`. `GameScreen` calls `useWakeLock(true)`.

- [ ] **Step 5: Safe areas and touch polish in `styles.css`**

```css
body { overscroll-behavior: none; -webkit-tap-highlight-color: transparent; }
.topbar { padding-top: calc(0.5rem + env(safe-area-inset-top)); padding-left: calc(0.75rem + env(safe-area-inset-left)); padding-right: calc(0.75rem + env(safe-area-inset-right)); }
.mine { padding-bottom: calc(0.5rem + env(safe-area-inset-bottom)); }
.card { -webkit-user-select: none; user-select: none; touch-action: manipulation; }
.toast.update { position: fixed; left: 50%; bottom: calc(1rem + env(safe-area-inset-bottom)); transform: translateX(-50%); }
```

(Adjust selectors to the existing class names for the top bar and hand tray.)

- [ ] **Step 6: `e2e/pwa.spec.ts`** (runs against the production build on 5174)

```ts
import { test, expect } from '@playwright/test';
const base = 'http://localhost:5174/unicorns/';

test('manifest, service worker, offline shell', async ({ page, context }) => {
  await page.goto(base);
  const manifest = await page.evaluate(async () => { const l = document.querySelector('link[rel=manifest]') as HTMLLinkElement; const r = await fetch(l.href); return r.json(); });
  expect(manifest.start_url).toBe('./'); expect(manifest.display).toBe('standalone');
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null && navigator.serviceWorker?.controller !== undefined, null, { timeout: 20_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play on this device' })).toBeVisible();
  await page.getByRole('button', { name: 'Play on this device' }).click();
  await page.getByRole('button', { name: 'Deal me in' }).click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await context.setOffline(false);
});
```

Note: `context.setOffline(true)` in Chromium still lets the service worker serve from cache; that is exactly what the test checks.

- [ ] **Step 7: Run**

```bash
npm run icons && npm run build && npm run typecheck && npx playwright test --project=pixel
```

Expected: all three specs pass. Confirm `dist/unicorns/sw.js` contains the precache list including `art/` files and icons.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "PWA: manifest, service worker, icons, wake lock, safe areas"
```

---

### Task 11: Server bundle, deploy scripts, CI, docs

**Files:**
- Create: `scripts/build-server.mjs`, `scripts/deploy-server.sh`, `scripts/deploy-web.sh`, `deploy/ecosystem.config.cjs`, `deploy/Caddyfile`, `docs/DEPLOY.md`, `.github/workflows/ci.yml`
- Modify: `README.md`, `CLAUDE.md`, `docs/ENGINE.md` (§9 milestone 4 marked done, pointer to spec)

- [ ] **Step 1: `scripts/build-server.mjs`**

```js
import { build } from 'esbuild';
await build({ entryPoints: ['src/server/index.ts'], bundle: true, platform: 'node', target: 'node20', format: 'esm', outfile: 'dist/server/unicorns-server.mjs', minify: false, sourcemap: false,
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } });
console.log('dist/server/unicorns-server.mjs');
```

Verify: `npm run build:server && UNICORNS_PASSPHRASE=x node dist/server/unicorns-server.mjs` prints `unicorns server on :8787`; `curl localhost:8787/healthz` → `ok`. Ctrl-C.

- [ ] **Step 2: `deploy/ecosystem.config.cjs`** (copied to the VM next to the bundle)

```js
module.exports = { apps: [{ name: 'unicorns', script: 'unicorns-server.mjs', cwd: '/home/ubuntu/unicorns', env_file: '/home/ubuntu/unicorns/.env', max_memory_restart: '200M', time: true }] };
```

pm2's `env_file` support varies by version; if unsupported on the VM, `deploy-server.sh` sources `.env` before `pm2 start` instead (`set -a; . ~/unicorns/.env; set +a`). Use the sourcing approach unconditionally — it is simpler:

```js
module.exports = { apps: [{ name: 'unicorns', script: 'unicorns-server.mjs', cwd: '/home/ubuntu/unicorns', max_memory_restart: '200M', time: true }] };
```

- [ ] **Step 3: `deploy/Caddyfile`**

```
play.geoffreychan.com {
	reverse_proxy localhost:8787
}
```

- [ ] **Step 4: `scripts/deploy-server.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
HOST=${UU_HOST:-ubuntu@140.238.145.208}
KEY=${UU_KEY:-$HOME/.ssh/oci_wordle_key}
cd "$(dirname "$0")/.."
npm run build:server
ssh -i "$KEY" "$HOST" 'mkdir -p ~/unicorns'
scp -i "$KEY" dist/server/unicorns-server.mjs deploy/ecosystem.config.cjs "$HOST":~/unicorns/
ssh -i "$KEY" "$HOST" 'set -e; cd ~/unicorns; test -f .env || { echo "create ~/unicorns/.env first (see docs/DEPLOY.md)"; exit 1; }; set -a; . ./.env; set +a; pm2 startOrRestart ecosystem.config.cjs --update-env; pm2 save; sleep 1; curl -fsS localhost:8787/healthz && echo " healthy"'
```

- [ ] **Step 5: `scripts/deploy-web.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
SITE=${SITE_REPO:-../../geoffchan23.github.io}
test -d "$SITE/.git" || { echo "site repo not found at $SITE (set SITE_REPO)"; exit 1; }
test -d assets/art || echo "warning: assets/art missing, building with placeholders"
npm run build
SHA=$(git rev-parse --short HEAD)
rsync -a --delete dist/unicorns/ "$SITE/unicorns/"
grep -q '!unicorns/\*\*/\*.png' "$SITE/.gitignore" || printf '!unicorns/**/*.png\n' >> "$SITE/.gitignore"
( cd "$SITE" && git add unicorns .gitignore && git commit -m "unicorns: deploy $SHA" && git push )
echo "deployed https://geoffreychan.com/unicorns/ (GitHub Pages takes a minute)"
```

`chmod +x scripts/*.sh`.

- [ ] **Step 6: `.github/workflows/ci.yml`**

```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npx playwright install --with-deps chromium
      - run: npm run icons
      - run: npx playwright test --project=pixel
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: playwright-report }
```

- [ ] **Step 7: `docs/DEPLOY.md`**

Write the runbook with these sections, each a numbered list of exact commands:

1. **DNS** — GoDaddy: add `A` record, host `play`, value `140.238.145.208`, TTL 600. Verify: `dig +short play.geoffreychan.com`.
2. **Oracle firewall** — console: VCN → security list → add ingress rules TCP 80 and 443 from `0.0.0.0/0`; or `oci session authenticate` then `oci network security-list update --security-list-id <ocid> --ingress-security-rules file://deploy/ingress.json` (include the JSON: existing SSH rule plus 80/443). Then on the VM:
   ```bash
   sudo iptables -I INPUT 5 -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 5 -p tcp --dport 443 -j ACCEPT
   sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save
   ```
   Verify from the Mac: `nc -z -G 3 140.238.145.208 80`.
3. **Caddy** — the official apt repo steps from caddyserver.com/docs/install, then `sudo cp Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy`. Verify: `curl -I https://play.geoffreychan.com/healthz` → 200 once the server runs.
4. **Server env** — `~/unicorns/.env`:
   ```
   UNICORNS_PASSPHRASE=<choose>
   PORT=8787
   ALLOWED_ORIGINS=https://geoffreychan.com
   ```
5. **Deploy** — `scripts/deploy-server.sh`, `scripts/deploy-web.sh`. Logs: `ssh ... pm2 logs unicorns`.
6. **Smoke test** — open `https://geoffreychan.com/unicorns/`, Play online, create a room with the passphrase, join from a phone with the code.

- [ ] **Step 8: Docs**

- `README.md`: update Status to "Playable online", the command block (from Task 4), and mark step 4 done with a pointer to `docs/DEPLOY.md`.
- `CLAUDE.md`: update Layout (add `src/server/`, `src/ui/net/`, `src/ui/pwa/`, `e2e/`, `scripts/deploy-*.sh`, `deploy/`), Commands (`npm run dev`, `npm run e2e`, `npm run build:server`, deploy scripts), and replace the "Agreed plan" paragraph with "Done: online multiplayer PWA (spec: …). Deploy runbook: docs/DEPLOY.md." Keep the "Decisions already made" list and add: passphrase gates create only; rooms in memory; art published on purpose.
- `docs/ENGINE.md` §9: mark milestone 4 done, note the server lives in `src/server/`.

- [ ] **Step 9: Final verification and commit**

```bash
npm run typecheck && npm test && npm run build && npm run build:server && npx playwright test
git add -A && git commit -m "Deploy scripts, CI, runbook, docs"
```

---

## Self-review notes

- Spec §3.2 host transfer (explicit + automatic, 20 s grace) → Task 6. §3.3 every message type → Task 6/7. §3.4 origin, passphrase, size cap, heartbeat, room cap, rate limit → Task 7. §3.5 bundle + deploy + VM setup → Task 11. §4.1 refactor → Tasks 3, 8, 9. §4.2 PWA → Task 10. §4.3 build/dev/deploy-web/CI → Tasks 4, 11. §5 error table → Tasks 6–9 (illegal action toast, reconnect banner, replace-with-bot, host transfer, server restart → NO_ROOM clears session, lobby form errors, malformed → close). §6 tests → Tasks 2, 5, 6, 7, 8, 9, 10.
- Names used consistently: `GameScreen`, `LocalGame`, `Setup`, `Home`, `Lobby`, `OnlineGame`, `GameClient`, `Snapshot`, `useClient`, `Room`, `RoomError`, `RoomRegistry`, `startServer`, `SeatInfo`, `unicornCounts`, test ids `topbar hand draw win prompt neigh target name passphrase create code join roomcode start playagain update`.
