# Engine design

The engine is a pure, deterministic, serialisable game-state machine with no knowledge of
the DOM or the network. Everything else (UI, bots, multiplayer server) sits on top of it and
talks to it through two functions:

```ts
applyAction(state: GameState, action: Action): GameState   // pure; throws on illegal action
legalActions(state: GameState, player: PlayerId): Action[]  // what a player may do right now
```

Plus one projection for hidden information:

```ts
viewFor(state: GameState, player: PlayerId): PlayerView     // hides other hands, deck order
```

## 1. Stack

- **TypeScript**, single Vite project. `src/engine/` is a dependency-free module (enforced
  with a lint rule: nothing in `src/engine` may import from `src/ui` or touch `window`).
- `src/ui/` is React. Comes later; the engine is testable and playable from tests and a
  scripted bot before any UI exists.
- **Vitest** for tests.
- Card data stays in `data/base-set-2e.json`. Card *behaviour* is TypeScript, keyed by the
  JSON `id`; a test asserts every id in the JSON has a definition and vice versa.

## 2. State

```ts
interface GameState {
  seed: number;                 // RNG state; all shuffles/random pulls derive from it
  players: Player[];            // seat order = turn order
  turn: { player: PlayerId; phase: 'begin'|'draw'|'action'|'end';
          playsRemaining: number; extraTurns: number };
  deck: CardInstanceId[];
  discard: CardInstanceId[];
  nursery: CardInstanceId[];
  cards: Record<CardInstanceId, { def: CardId; owner?: PlayerId }>;
  stack: StackItem[];           // cards being played, waiting on Neigh windows
  pending?: Prompt;             // engine paused waiting for a player decision
  log: LogEntry[];              // human-readable, for the UI and for debugging
  winner?: PlayerId;
}
interface Player { id; hand: CardInstanceId[]; stable: CardInstanceId[]; }
```

Every card instance has a unique id, so two copies of Neigh are distinguishable and card
conservation (always exactly 127 instances across all zones) can be asserted in tests.

## 3. The interaction problem

Most card effects need decisions mid-resolution: pick a target, choose whether to use an
optional effect, "sacrifice a card, *then* destroy two". The engine cannot block on a UI, so
it has to be able to pause and resume.

**Approach: replay-based continuations.** Card effects are ordinary imperative TypeScript
that call `ctx.choose(...)` whenever they need input:

```ts
onEnter(ctx) {
  const target = ctx.choose(ctx.owner, 'unicornInAnyStable', { optional: true });
  if (!target) return;
  ctx.destroy(target);
}
```

The engine runs an effect against a *snapshot* of state. Each `choose` call consumes the
next entry in an `answers` list attached to the pending effect. When the list runs out, the
effect throws a `NeedInput` signal; the engine discards the snapshot, records the prompt in
`state.pending`, and returns. When the player answers, the answer is appended and the effect
is re-run from the start against a fresh snapshot. Because the RNG is seeded state and the
effect is pure, replaying is identical up to the new prompt.

This keeps effect code readable (no hand-rolled state machines per card) while the game
state stays plain JSON (no generators or closures to serialise), which is what save/restore,
undo, and a server-authoritative multiplayer mode all need.

## 4. Playing a card and the Neigh stack

1. Player takes `{type:'play', card, target?}` in their Action phase. Legality checks run
   here: Slowdown / Ginormous for Neighs, Broken Stable for Upgrades, Queen Bee for Basic
   Unicorns, Extra requirements per card.
2. The card is pushed onto `state.stack` and a **reaction window** opens: every other
   player who *could* play a Neigh is listed in `pending = { kind:'neighWindow', awaiting }`.
   Yay on the player, or a Super Neigh being played, skips the window entirely.
3. Each awaiting player either passes or plays a Neigh. A Neigh is itself pushed onto the
   stack and opens its own window (a Neigh can be Neigh'd). Playing it never costs an Action.
4. When every awaiting player has passed, the stack resolves top-down: each Neigh cancels
   the item below it. The bottom card either resolves (enters a Stable / runs its Magic
   effect) or goes to the discard pile unresolved.
5. The Action was spent either way.

Beginning-of-turn effects, on-enter effects, and abilities of cards already in play never
touch the stack, which is exactly the rule that they cannot be Neigh'd.

## 5. Events, triggers, and replacement effects

Every zone change goes through a small number of primitives — `moveCard`, `destroy`,
`sacrifice`, `discard`, `steal`, `returnToHand`, `draw` — and only those primitives emit
events. Cards subscribe to events by exporting handlers:

| Handler | Fires when |
|---|---|
| `onEnter` | the card enters a Stable (played, stolen, moved, brought in) |
| `onBeginTurn` | its controller's Beginning of Turn phase, if it was there at the start |
| `onLeave` | the card leaves a Stable (any reason) |
| `onUnicornEntered / Left` | a Unicorn enters or leaves the controller's Stable (Barbed Wire, Tiny Stable) |
| `replaceRemoval` | the card, or another card in the Stable, *would be* destroyed / sacrificed / returned |
| `static` | continuous modifiers queried on demand (below) |

**Replacement effects** are the tricky group: Baby Unicorn → Nursery, Unicorn Phoenix,
Black Knight Unicorn, the four Flyers, Rainbow Aura, Magical Kittencorn, Pandamonium.
`destroy(card)` does not move the card directly; it builds a `RemovalEvent` and offers it to
every `replaceRemoval` handler in the affected Stable, in a fixed priority order:

1. immunities (Rainbow Aura, Kittencorn vs Magic, Pandamonium) — the removal simply fails;
2. optional saves that ask the controller (Black Knight, Phoenix);
3. redirects (Baby → Nursery, Flyers → hand).

Only if nothing replaces it does the card go to the discard pile, and only then does
`onLeave` fire (so Stabby the Unicorn triggers on a real removal, not a replaced one).

**Static modifiers** are queries, not events: `unicornCount(player)` asks every card in the
Stable for its contribution (Ginormous = 2, or 1 under Blinding Light; Pandas = 0);
`canPlay(player, card)` asks for vetoes (Slowdown, Broken Stable, Queen Bee); `isNeighable`
asks Yay. Blinding Light is implemented as a filter on which handlers of a Stable's Unicorns
are consulted at all, with Baby Unicorns exempt.

## 6. Turn loop

```
begin  → for each card with onBeginTurn (owner picks order; Tiny Stable first): run it
draw   → draw 1 (reshuffle discard if deck empty)
action → wait for play / draw; Double Dutch sets playsRemaining = 2
end    → discard down to 7; if extraTurns > 0 restart at begin for same player, else next seat
```

The win check runs after every zone change, not once per turn, because a player can reach
the target on someone else's turn.

## 7. Card definition shape

```ts
// src/engine/cards/shark-with-a-horn.ts
export default defineCard('shark-with-a-horn', {
  onEnter(ctx) {
    if (!ctx.confirm(ctx.owner, 'Sacrifice Shark With a Horn to destroy a Unicorn?')) return;
    ctx.sacrifice(ctx.self);
    const t = ctx.choose(ctx.owner, 'unicornInOtherStable');
    if (t) ctx.destroy(t);
  },
});
```

Rulings from the `notes` field in the JSON are implemented in these files and each one gets
a unit test that reproduces the ruling.

## 8. Testing

- **Per-card tests** using a scripted harness: `setup({ stables, hands })`, `play(...)`,
  `answer(...)`, then assert on zones. Every one of the 84 cards gets at least one.
- **Simulation tests**: a random-legal-move bot plays thousands of seeded games. Assertions:
  no exceptions, every game terminates, exactly 127 card instances at all times, Baby
  Unicorns never in hand/deck/discard, winner really has the required count.
- **Replay determinism**: same seed + same action list ⇒ identical state.

## 9. Milestones

1. **Core**: state, primitives, turn loop, Neigh stack, prompts, bot, simulation tests.
   Ships with the ~25 cards that need no special handling (Basic/Baby Unicorns, Neighs,
   draw/discard Magic).
2. **All 84 cards** with tests, including the replacement-effect group.
3. **Hot-seat web UI**: one browser, pass-and-play, plus play-vs-bots.
4. **Multiplayer**: Node server runs the same engine, clients receive `viewFor` projections
   and send actions. Nothing in the engine changes for this step.
