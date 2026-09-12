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
  events.ts             emit/say/moved: the event stream (state.events) the UI animates; see ENGINE.md §5b
  cards/*.ts            one defineCard() per card, grouped by type
  bot.ts                playersToAct, randomBotAction, greedyBotAction
  sim.ts                random-game simulator with invariants (npm run sim [games] [players])
  __tests__/            harness.ts + per-card tests; every card has at least one
src/server/             ws game server: Room/RoomRegistry, protocol, startServer (bundled by scripts/build-server.mjs)
src/ui/                 React app: Home/Setup/Lobby, GameScreen (the table) + LocalGame/OnlineGame drivers
src/ui/stage/           staged playback: playback.ts (rewind/apply a view through events, pure), useStage (queue +
                        flyers/bubbles/banner), anchors (DOM rects per card/zone), busy (bots wait for the stage)
src/ui/table/           Seats (avatars), Centre (deck/stage/piles), Mine (stable row + hand fan), Bubbles
                        (speech, in a layer over the table), TurnBanner, WinOverlay
src/ui/sheets.tsx       bottom sheets: prompt, Neigh, begin-turn, card detail, stable, history
src/ui/table.css        the table; styles.css keeps menus, cards, sheets
src/ui/localSave.ts     the local game is saved after every action (seed, seats, actions) and resumed on reload
src/ui/net/             GameClient: reconnecting websocket, typed send/subscribe (src/ui/net/client.ts)
src/ui/pwa/             manifest, service worker, icons, wake lock (copied into dist/unicorns by scripts/build.mjs)
e2e/                    Playwright specs (local, online, pwa) against the dev and production builds
scripts/build.mjs       esbuild -> dist/unicorns/ (static PWA: index.html, hashed app.js/css, manifest, sw.js, icons/, art/)
scripts/build-server.mjs esbuild -> dist/server/unicorns-server.mjs (single-file server bundle, ws included)
scripts/dev.mjs         client watch+serve on :5173 plus the game server on :8787, NODE_ENV=development
scripts/deploy-server.sh builds and ships the server bundle to the VM, restarts it under pm2
scripts/deploy-web.sh   builds the client and rsyncs it into the geoffchan23.github.io site repo
scripts/art.py          regenerates assets/art/*.webp from two GitHub fan repos (needs pillow)
deploy/                 ecosystem.config.cjs (pm2) and Caddyfile, both copied to the VM; ingress.json is a
                        local input to the OCI CLI (`oci network security-list update`), never copied there
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

## Reproducing a game from a bug report

The seed input is hidden; `?seed=123` on the URL fixes the shuffle and the bots' choices. In a local game the History
sheet ends with "Copy a game report" (seed, seats, every action, as JSON, to the clipboard); nothing about seeds is
shown to players elsewhere. Replay one with
`npx tsx scripts/replay.ts report.json --verbose` to see each action, the log lines it produced, and the first illegal
action if the report no longer matches the engine. Themes: light, dark, barf (toggle on the home screen, stored as `uu.theme`).
`?motion=off` (or the OS reduced-motion setting) plays events instantly; the e2e specs use it, except animations.spec.ts.

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
- Every zone change goes through a Ctx primitive that emits a `move` event; every log line goes through `say()`
  (the sim fails if the events do not explain the zones). The UI never reads the log for animation, only events.
- A card whose effect is invisible in the interface owes the player a line saying where to look: `APP_HINTS`
  in `sheets.tsx` (Nanny Cam is the first). Rules the view knows about are projected, not re-derived in the
  UI from card ids — `players[].handOpen` is how the table knows whose hand it may read.
- The table stays React + DOM (no game engine); animation is the Web Animations API + CSS, no animation library.
  Decisions wait for the staged playback (`stage.busy`); bots wait for it too.
- No passphrase: anyone the origin check admits may create a room, and joining needs only the 4-letter code.
  A shared family passphrase was tried and dropped (2026-09-11) as friction that bought nothing the caps in
  `server.ts` do not already give: origin allowlist, one new room a minute per IP, 50 rooms, 200 connections,
  rooms reaped when empty. The earlier design docs under `docs/superpowers/` still describe it; they are a
  record of that work, not the current behaviour.
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

## Versioning and branches

- `main` is protected on GitHub: changes go through a pull request. Repository admins (the owner) may still
  push straight to `main`; everyone else cannot. Force pushes and branch deletion are blocked for everyone.
- **Bump the minor version on every merge that changes the game in a way a player would notice** — a feature,
  a visible redesign, a rules-affecting fix: `v1.0` → `v1.1` → `v1.2`. Tag the merge commit
  (`git tag -a v1.1 -m "<what changed>" && git push origin refs/tags/v1.1`), set the same number in
  `package.json`, and cut a GitHub release (`gh release create v1.1 --notes "..."`). Patch bumps (`v1.1.1`)
  are for fixes shipped on their own; typo fixes, tests, refactors and tooling need no bump at all.
- Releases so far: `v0.5` the text-first UI (branch and tag), `v1.0` the animated table.

## Status and next steps

Done: online multiplayer PWA (spec: `docs/superpowers/specs/2026-09-08-online-pwa-design.md`). Deploy
runbook: `docs/DEPLOY.md`. v0.5 (tag + branch) is the text-first UI; main has the animated table
(spec: `docs/superpowers/specs/2026-09-10-game-table-animations-design.md`).

Known gaps: Unicorn Oracle has no art (placeholder); the bot sees hidden hands; no sound; no dealing animation at
game start; online seats derive their avatar from the name (no picker).
`viewFor` includes `pending` prompt options and the full `cards` map, so a curious online player can read
some card ids they should not see.
