# Unstable Unicorns — Web

An unofficial, in-progress web implementation of the card game **Unstable Unicorns**
(base set, 2nd Edition).

> Unstable Unicorns is a trademark of Unstable Games / TeeTurtle. This is a fan project for
> personal use, not affiliated with or endorsed by them, and it ships no card artwork.

## Status

**Playable online.** `src/engine/` is a pure TypeScript game engine (no UI, no network) with
all 84 base-set cards implemented and tested; `src/ui/` is a React app, installable as a PWA,
for pass-and-play, play-vs-bot, or online multiplayer through a small game server in
`src/server/`.

```
npm install
npm test                 # 128+ tests: per-card scripts, Neigh chains, random-bot simulations, server, client
.cache/venv/bin/python scripts/art.py   # card art (needs pillow: python3 -m venv .cache/venv && .cache/venv/bin/pip install pillow)
npm run build             # dist/unicorns/ static PWA
npm run build:server      # dist/server/unicorns-server.mjs single-file game server bundle
npm run dev               # http://localhost:5173/unicorns/ + game server on :8787
npm run e2e               # Playwright end-to-end tests
npm run sim 200 4         # play 200 random 4-player games and report timing
```

See [`docs/ENGINE.md`](docs/ENGINE.md) for the design. The short version: `createGame`,
`applyAction`, `legalActions`, and `viewFor` are the whole API; card effects are plain
imperative code that pause for player input through a replay-based prompt system.

- [`docs/RULES.md`](docs/RULES.md) — rules digest written for implementation: zones, setup,
  turn phases, keyword semantics, Neigh chain resolution, win conditions, and the edges that
  the printed rulebook leaves implicit. Uncertain points are flagged `[unverified]`.
- [`data/base-set-2e.json`](data/base-set-2e.json) — all 127 playable base-set cards
  (84 unique faces), with type, copy count, full card text, wiki catalogue number, a
  machine-readable `triggers` classification, and a `removedInTwoPlayer` flag.

## The deck at a glance

| Type | Unique | Copies |
|---|---|---|
| Baby Unicorn | 13 | 13 |
| Basic Unicorn | 8 | 22 |
| Magical Unicorn | 30 | 30 |
| Magic | 15 | 25 |
| Instant (Neigh ×14, Super Neigh ×1) | 2 | 15 |
| Upgrade | 8 | 14 |
| Downgrade | 8 | 8 |
| **Total** | **84** | **127** |

Plus 8 rule reference cards in the retail box, for the advertised 135.

**2-player games** follow the official variant: 32 cards are removed (all Basic Unicorns,
Rainbow Unicorn, Queen Bee Unicorn, Mother Goose Unicorn, Necromancer Unicorn, Seductive
Unicorn, Nanny Cam, Sadistic Ritual, Slowdown, both Yay), and each player starts with a Neigh
in hand on top of the usual 5 cards. Details in `docs/RULES.md` §10.

## Card data shape

```json
{
  "id": "shark-with-a-horn",
  "name": "Shark With a Horn",
  "type": "magical_unicorn",
  "isUnicorn": true,
  "count": 1,
  "text": "When this card enters your Stable, you may SACRIFICE this card, then DESTROY a Unicorn card.",
  "cardNumber": "UU-Base-044",
  "triggers": ["on_enter"],
  "removedInTwoPlayer": false
}
```

`type` is one of `baby_unicorn`, `basic_unicorn`, `magical_unicorn`, `magic`, `instant`,
`upgrade`, `downgrade`.

`triggers` is derived from the card text and tells the engine when to look at the card:
`on_enter`, `beginning_of_turn`, `on_leave_self`, `continuous_triggered`, `passive`,
`on_play`, `instant`, `none`.

## Next steps

1. ~~Rules and card data~~
2. ~~Engine with all 84 cards~~
3. ~~Hot-seat web UI (React), play-vs-bot, card art~~
4. ~~Online multiplayer PWA at geoffreychan.com/unicorns with a small game server~~. Design
   in `docs/superpowers/specs/2026-09-08-online-pwa-design.md`; deploy runbook in
   [`docs/DEPLOY.md`](docs/DEPLOY.md).
