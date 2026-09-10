# Game table and animations — design

Status: approved in conversation 2026-09-10 (the user asked for the full animated version and to build it without
further check-ins). v0.5 (the text-first UI) is tagged and branched as `v0.5`; this work lands on `main`.

## Why

Play-testing with kids: the turn log was the main complaint, the screen was "overwhelming because of all the text",
and the one thing they liked was the row of cards at the bottom. The comparison points are the Exploding Kittens app
and Lorcana: avatars around a table, a deck in the middle, cards that physically travel (draw → hand, hand → stable,
stable → discard) and flip as they go, and big moments (Neigh, destroy, win) that land with a visual thump.

## Decision: stay on React + DOM

No game engine. A card game is a UI-heavy 2D app; the DOM is best at text, layout, accessibility and responsiveness,
and the PWA shell, websocket client, lobby and e2e tests all stay. What was actually missing:

1. the engine reported what happened only as text log lines, so a client could not know *what moved where*;
2. the client snapped straight to the final state after every action, so nothing could be staged.

Both are fixed here. Animations use the Web Animations API and CSS transitions; no animation library. A canvas
particle layer can be added later without changing anything below.

## 1. Engine: an event stream

`GameState` gains `events: GameEvent[]`. Events are appended by the same primitives that already write the log, so
the ordering between "what was said" and "what moved" is exact. The log stays for history and tests.

```ts
type Zone =
  | { kind: 'deck' } | { kind: 'discard' } | { kind: 'nursery' } | { kind: 'limbo' }
  | { kind: 'hand'; player: PlayerId } | { kind: 'stable'; player: PlayerId };

type MoveHow =
  | 'draw' | 'play' | 'neigh' | 'resolve' | 'countered' | 'discard' | 'destroy' | 'sacrifice'
  | 'return' | 'steal' | 'move' | 'bring' | 'search' | 'deckTop' | 'nursery';

type GameEvent = { seq: number } & (
  | { kind: 'move'; card: InstanceId | null; from: Zone; to: Zone; how: MoveHow; actor?: PlayerId }
  | { kind: 'shuffle'; count: number }                 // discard pile shuffled into the deck
  | { kind: 'turn'; player: PlayerId; number: number }
  | { kind: 'say'; text: string; actor?: PlayerId; affects?: PlayerId[]; notice?: boolean }
  | { kind: 'protected'; card: InstanceId; by: InstanceId | null }
  | { kind: 'win'; player: PlayerId }
);
```

- `seq` is `events.length` at push time. Because effects re-run deterministically from a snapshot, the events a
  preview run produces have the same `seq` as the committed run, so clients de-duplicate by `seq`.
- `say` events mirror every log line and carry `actor` where one is known (the effect's controller, the drawing or
  discarding player, the player who played the card). `LogEntry` gains the same optional `actor`.
- `viewFor` redacts `card` to `null` on a move whose ends are both hidden from the viewer (a draw into another
  player's hand without Nanny Cam). Everything else keeps the id; if either end is visible the card was visible anyway.
- Every zone change goes through `Ctx.pluck` + a destination push; `pluck` now returns the source zone and each
  destination method emits the move. `game.ts` emits the `play`/`neigh` moves into `limbo`, the `turn` event from
  `nextTurn` (and game start), and `checkWin` emits `win`.
- `cloneState` treats `events` like `log` (append-only, shallow copied).

Tests: draw/play/resolve/counter/destroy/steal/return each emit the expected moves; seq is contiguous; `viewFor`
redaction; preview-vs-commit seq equality; the sim asserts every move's `from` zone held the card (replayed on the
pre-state) — cheap card-conservation for events.

## 2. Client: staged playback

`src/ui/stage/`:

- `playback.ts` (pure, tested): `rewind(view, events)` takes the newest `PlayerView` and the fresh events and returns
  the view *as it was before them* by undoing moves in reverse (hidden zones are counts: `deckCount`, `handCount`).
  `applyEvent(view, ev)` redoes one. Round trip: `apply*(rewind(v, es), es) ≡ v` on zone data.
- `useStage(view)`: keeps `shown` (what the table renders) and an event queue. On a new `view`, fresh events (seq >
  last seen) are queued and `shown` is set to `rewind(view, fresh)`; the queue then plays one event at a time
  (`applyEvent` + visual), and when it drains `shown = view` (this also brings in `pending`, `stack`, `unicornCounts`,
  `winner`). While the queue is non-empty the table is `busy`: prompt sheets, the Neigh sheet, the begin-turn sheet
  and the win overlay are held back, and the hand is not tappable.
- Visuals are FLIP flyers: before applying a move, measure the source anchor (the card element if visible, else the
  zone anchor: deck pile, an avatar, the discard pile, the stage); apply; after layout measure the destination anchor;
  animate a portal card from one rect to the other with WAAPI (translate + scale, an arc, a `rotateY` flip when the
  face changes). The destination slot renders `visibility: hidden` until the flyer lands.
- Anchors are a `Map<string, HTMLElement>` filled by ref callbacks: `card:<id>`, `zone:deck`, `zone:discard`,
  `zone:nursery`, `zone:stage`, `zone:hand:<p>`, `zone:stable:<p>`.
- Durations (ms): draw 550, play 600 (+ a 350 showcase hold on the stage), resolve 500, destroy/sacrifice 700
  (shake, then fly), steal 650, return 500, turn banner 900, say 0 (bubbles are fire-and-forget, 2.6 s on screen),
  shuffle 600, win 0 (overlay after drain). `prefers-reduced-motion` collapses all to 0 and skips flyers.
- Bot pacing: a tiny `stage/busy.ts` publishes the busy flag; `LocalGame` waits for idle before a bot acts, so the
  queue never lags far behind. Online, the server already spaces bots; the client queue simply plays.

## 3. The table (new `GameScreen`)

Portrait-first; one screen, no scrolling in the main layout.

```
 top bar   turn N · first to 7 · [history] [quit]
 seats     avatar ring per opponent: emoji avatar on a coloured disc, name, unicorn count badge,
           mini fan of card backs (hand count), thumbnail strip of the stable. Active player's disc
           glows; tap opens the stable (existing expanded panel, as a sheet).
 centre    deck pile (count) · discard pile (top card) · nursery pile; the STAGE in the middle where a
           played card sits large while the Neigh window is open, with the Neigh chain beside it.
 mine      my stable as a thumbnail row with unicorn count; my hand as a fan (the part the kids liked,
           kept as full cards: art, name, text). Playable cards lift and glow; "Draw" is a big button on
           my turn. Speech bubbles for my own actions appear above my stable.
```

- Speech bubbles: a `say` with an actor shows a bubble by that player's avatar (mine above my stable); notices keep
  the toast. `affects` shakes the affected avatars. The log is gone from the table; the history sheet stays behind
  the top-bar button.
- Turn banner: a `turn` event sweeps "SPRINKLES'S TURN" / "YOUR TURN" across the centre.
- Stage moments: a played card flies to the stage, scales up, holds; a Neigh slams a red "NEIGH!" stamp over it and
  shakes; a countered card tumbles to the discard pile greyed out; a resolved card flies on to its stable.
  Destroy/sacrifice: the card flashes red, shakes, and tumbles to the discard. Steal: flies stable to stable.
- Avatars: emoji on a gradient disc, chosen in local setup (tap to cycle) and derived from the name hash otherwise
  (online seats need no protocol change). Bots default to unicorn-ish emoji.
- Text diet: sheets keep title + cards + one instruction line; the topbar meta shrinks to what matters.
- Existing test ids stay (`topbar`, `hand`, `.card.playable`, `play`, `detail`, `draw`, `prompt`, `neigh`, `pass`,
  `begin`, `begin-draw`, `target`, `win`, `notice`, `history-open`, `report`, `expanded`, `expanded-close`,
  `stable-toggle`), so the e2e suite keeps running against the new table.

## 4. Files

```
src/engine/types.ts        Zone, MoveHow, GameEvent; GameState.events; LogEntry.actor
src/engine/events.ts       emit helpers (say/move/turn/…) shared by effects.ts and game.ts
src/engine/effects.ts      pluck returns the zone; destinations emit; log() emits say with actor
src/engine/game.ts         play/neigh/turn/win/countered events
src/engine/view.ts         events in the view, redacted
src/engine/clone.ts        events shallow-copied
src/ui/stage/{playback,useStage,anchors,busy,Flyer}.ts(x)
src/ui/table/{Seats,Avatar,Centre,Hand,MyStable,Bubbles,TurnBanner}.tsx
src/ui/sheets/{Sheet,PromptSheet,CardDetailSheet,NeighSheet,BeginTurnSheet,HistorySheet}.tsx (extracted)
src/ui/GameScreen.tsx      composition only
src/ui/table.css           the table; styles.css keeps menus, cards, sheets
src/ui/avatars.ts          emoji sets + name hash
```

## 5. Out of scope (later)

Sound, particles (canvas layer), a dealing animation at game start, avatar choice for online seats, the bot seeing
hidden hands, `viewFor` still shipping the full `cards` map.
