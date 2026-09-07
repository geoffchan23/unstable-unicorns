# Unstable Unicorns — Web

An unofficial, in-progress web implementation of the card game **Unstable Unicorns**
(base set, 2nd Edition).

> Unstable Unicorns is a trademark of Unstable Games / TeeTurtle. This is a fan project for
> personal use, not affiliated with or endorsed by them, and it ships no card artwork.

## Status

**Step 1 of the build: rules and card data.** No game code yet.

- [`docs/RULES.md`](docs/RULES.md) — rules digest written for implementation: zones, setup,
  turn phases, keyword semantics, Neigh chain resolution, win conditions, and the edges that
  the printed rulebook leaves implicit. Uncertain points are flagged `[unverified]`.
- [`data/base-set-2e.json`](data/base-set-2e.json) — all 127 playable base-set cards
  (84 unique faces), with type, copy count, full card text, wiki catalogue number, and a
  machine-readable `triggers` classification.

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
  "triggers": ["on_enter"]
}
```

`type` is one of `baby_unicorn`, `basic_unicorn`, `magical_unicorn`, `magic`, `instant`,
`upgrade`, `downgrade`.

`triggers` is derived from the card text and tells the engine when to look at the card:
`on_enter`, `beginning_of_turn`, `on_leave_self`, `continuous_triggered`, `passive`,
`on_play`, `instant`, `none`.

## Next steps

1. Turn `triggers` into an executable effect DSL (each card gets a resolver).
2. Game engine: zones, turn loop, the Neigh interrupt stack, win check.
3. Web UI, then local hot-seat play, then bots, then networked multiplayer.
