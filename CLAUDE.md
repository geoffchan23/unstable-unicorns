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
src/ui/                 React app (App.tsx, Card.tsx, styles.css, template.html)
scripts/build.mjs       esbuild -> dist/unstable-unicorns.html (single file, art inlined) + dist/index.html
scripts/art.py          regenerates assets/art/*.webp from two GitHub fan repos (needs pillow)
scripts/shot.mjs        playwright screenshot of dist/index.html for a quick visual check
```

## Commands

```
npm install
npm test                 # vitest, ~10s
npm run typecheck
python3 scripts/art.py   # once per clone: card art (gitignored, copyright Unstable Games)
npm run build            # dist/unstable-unicorns.html
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

## Conventions

- Card ids are the slugs in the JSON (`shark-with-a-horn`). Adding a card = JSON entry + defineCard + test;
  the registry test fails if either side is missing.
- Tests use `setup({ hands, stables, deckTop, discard, plays })` from `__tests__/harness.ts`. Card tests
  pass `plays: 9` so the turn does not auto-advance. Remember the previous player's draw eats the top deck card.
- Prompts with a single option auto-resolve (no prompt is raised), which affects test scripting.
- Commit art files never; `assets/art/` and `.cache/` are gitignored.

## Status and next steps

Done: rules/data, engine with all cards and 91 tests, hot-seat + vs-bot web UI, card art, published
as a private Claude artifact (single HTML) for phone testing.

Agreed plan for mobile (family devices only, no store):
1. Capacitor wrapping the existing web build: `npx cap add android`, safe-area + keep-awake, app icon.
   Debug APK via Gradle, `adb install`. Sideload for phones without adb.
2. GitHub Actions workflow that builds the debug APK on every push and publishes it as a run artifact
   (runners have the Android SDK; this sandbox did not).
3. iPads: install as a PWA (manifest + service worker, GitHub Pages deploy from this repo) instead of
   Apple signing. Capacitor's iOS project stays available if a Mac + developer account appear later.
4. Networked multiplayer: server-authoritative Node process running the same engine, clients receive
   `viewFor` views and send actions. Design in docs/ENGINE.md §9.

Known gaps: Unicorn Oracle has no art (placeholder); the bot sees hidden hands; log shows last 40 lines.
