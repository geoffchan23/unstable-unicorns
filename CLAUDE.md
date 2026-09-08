# Unstable Unicorns (web) — project guide

Unofficial family-only implementation of the Unstable Unicorns card game, **base set, 2nd Edition**.
Not affiliated with Unstable Games; never to be published to an app store.

## Layout

```
data/base-set-2e.json   all 84 cards: text, counts, triggers, 2-player flag, rulings in `notes`
docs/RULES.md           rules digest written for implementation (zones, phases, keywords, Neigh, 2-player)
docs/ENGINE.md          engine design: replay-based prompts, Neigh stack, removal pipeline
src/engine/             pure TS game engine, no UI/network deps (a test enforces this)
  game.ts               createGame / applyAction / legalActions / run / previewState
  effects.ts            Ctx (primitives + prompts), removal pipeline, runEffect
  cards/*.ts            one defineCard() per card, grouped by type
  bot.ts                playersToAct, randomBotAction, greedyBotAction
  sim.ts                random-game simulator with invariants (npm run sim [games] [players])
  __tests__/            harness.ts + per-card tests; every card has at least one
src/server/             ws game server: Room/RoomRegistry, protocol, startServer (bundled by scripts/build-server.mjs)
src/ui/                 React app: Home/Setup/Lobby, GameScreen (presentational) + LocalGame/OnlineGame drivers
src/ui/net/             GameClient: reconnecting websocket, typed send/subscribe (src/ui/net/client.ts)
src/ui/pwa/             manifest, service worker, icons, wake lock (copied into dist/unicorns by scripts/build.mjs)
e2e/                    Playwright specs (local, online, pwa) against the dev and production builds
scripts/build.mjs       esbuild -> dist/unicorns/ (static PWA: index.html, hashed app.js/css, manifest, sw.js, icons/, art/)
scripts/build-server.mjs esbuild -> dist/server/unicorns-server.mjs (single-file server bundle, ws included)
scripts/dev.mjs         client watch+serve on :5173 plus the game server on :8787, NODE_ENV=development
scripts/deploy-server.sh builds and ships the server bundle to the VM, restarts it under pm2
scripts/deploy-web.sh   builds the client and rsyncs it into the geoffchan23.github.io site repo
scripts/art.py          regenerates assets/art/*.webp from two GitHub fan repos (needs pillow)
deploy/                 ecosystem.config.cjs (pm2), Caddyfile, ingress.json (OCI firewall rules) — copied to the VM
```

## Commands

```
npm install
npm test                 # vitest, ~10s
npm run typecheck
python3 scripts/art.py   # once per clone: card art (gitignored, copyright Unstable Games)
npm run build             # dist/unicorns/ static PWA
npm run build:server      # dist/server/unicorns-server.mjs
npm run dev               # client :5173 + game server :8787
npm run e2e               # Playwright e2e tests
scripts/deploy-server.sh  # ship the game server to the VM (see docs/DEPLOY.md)
scripts/deploy-web.sh     # publish the client to geoffreychan.com/unicorns/
```

## Decisions already made (don't relitigate)

- 2nd Edition card list and wording (127 playable cards, 84 unique). 1st Edition differs; see RULES.md §11.
- 2-player: official removals (32 cards) + one starting Neigh each; auto-applied for 2 players.
- Rulings recorded in the `notes` field of the JSON and implemented in tests: Pandamonium pandas count 0
  toward winning; Blinding Light ignores all Unicorn effects except Baby Unicorns; Rhinocorn ends the turn
  but the hand-limit discard still applies; Mystical Vortex is not shuffled into the deck; Necromancer and
  Dark Angel may revive the card just discarded/sacrificed; Tiny Stable resolves before other triggers.
- A win mid-effect commits the snapshot and aborts the rest of the effect (wins are immediate).
- Beginning-of-turn effects resolve in stable order, Tiny Stable first (owner-chosen order is a TODO).
- Card effects are imperative code using `ctx.choose*()`; the engine replays them with recorded answers.
  Never store closures in state. Effects that need to run "instead of" a removal use the
  immuneTo / protectsOthers (pure) and replaceRemoval / protectOther (effectful, called once) hooks.
- Engine must stay free of DOM/React imports.
- A family passphrase gates room creation only; joining an existing room needs only its 4-letter code.
- Rooms live in server memory only — a server restart drops all games; clients get NO_ROOM and clear
  their session back to Home.
- Card art is published on purpose (into the public `geoffchan23.github.io` site repo), unlike the
  gitignored local `assets/art/`.

## Conventions

- Card ids are the slugs in the JSON (`shark-with-a-horn`). Adding a card = JSON entry + defineCard + test;
  the registry test fails if either side is missing.
- Tests use `setup({ hands, stables, deckTop, discard, plays })` from `__tests__/harness.ts`. Card tests
  pass `plays: 9` so the turn does not auto-advance. Remember the previous player's draw eats the top deck card.
- Prompts with a single option auto-resolve (no prompt is raised), which affects test scripting.
- Commit art files never; `assets/art/` and `.cache/` are gitignored.

## Status and next steps

Done: online multiplayer PWA (spec: `docs/superpowers/specs/2026-09-08-online-pwa-design.md`). Deploy
runbook: `docs/DEPLOY.md`.

Known gaps: Unicorn Oracle has no art (placeholder); the bot sees hidden hands; log shows last 40 lines.
