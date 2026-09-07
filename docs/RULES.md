# Unstable Unicorns — Base Set Rules (implementation reference)

This is a working digest of the rules for the **Unstable Unicorns base set, 2nd Edition**
(the current retail printing, 135 cards in the box). It is written to be turned into code,
so it is more explicit about ordering and edge cases than the printed rulebook is.

Anything marked **[unverified]** could not be confirmed against a primary source from this
environment (see [Sources and confidence](#sources-and-confidence)) and should be checked
against a physical rulebook before it is relied on.

---

## 1. Components

| Group | Cards |
|---|---|
| Baby Unicorn | 13 |
| Basic Unicorn | 22 |
| Magical Unicorn | 30 |
| Magic | 25 |
| Instant (Neigh / Super Neigh) | 15 |
| Upgrade | 14 |
| Downgrade | 8 |
| **Playable total** | **127** |
| Rule reference cards | 8 |
| **Box total** | **135** |

Full card-by-card data lives in [`data/base-set-2e.json`](../data/base-set-2e.json).

## 2. Zones

- **Deck / draw pile** — face down, shared.
- **Discard pile** — face up, shared. Cards that are destroyed, sacrificed, discarded, or
  Neigh'd end up here.
- **Nursery** — a face-up pile of Baby Unicorns, shared. Baby Unicorns are *only* ever in
  the Nursery or in a Stable. They never enter a hand, the deck, or the discard pile.
- **Stable** — one per player, face up. Holds that player's Unicorn, Upgrade, and Downgrade
  cards. This is public information.
- **Hand** — private, unless a card (Nanny Cam) says otherwise.

## 3. Setup

1. Separate every Baby Unicorn from the deck and put them face up as the **Nursery**.
2. Each player takes one Baby Unicorn from the Nursery and puts it in their Stable. This is
   their starting Unicorn.
3. Shuffle the remaining cards and deal **5** to each player.
4. Put the rest face down as the draw pile. Leave room beside it for the discard pile.
5. Pick a starting player. Play proceeds clockwise (i.e. to the left).

## 4. Objective

Be the first player with the required number of **Unicorns** in your Stable:

| Players | Unicorns to win |
|---|---|
| 2–5 | 7 |
| 6–8 | 6 |

A player wins **the instant** the condition is met, including in the middle of somebody
else's turn (for example when a Unicorn is moved into their Stable by another player's card).

Upgrade and Downgrade cards never count toward the total. Ginormous Unicorn counts as **2**.

## 5. Turn structure

Every turn has four phases, in order.

### 5.1 Beginning of Turn phase
Resolve every card in your Stable that reads *"If this card is in your Stable at the
beginning of your turn…"*. You choose the order if several trigger at once.

- Effects worded *"you may"* are optional.
- Effects with no *"may"* (e.g. Sadistic Ritual) are mandatory.
- The card must already have been in your Stable when the phase began — a card that arrives
  later this turn does not trigger.
- These triggers are **not** cards being played, so they cannot be Neigh'd.

### 5.2 Draw phase
Draw one card from the deck.

### 5.3 Action phase
Do exactly **one** of:

- **Play a card** from your hand, or
- **Draw a card** from the deck (instead of playing).

Playing a card means: announce it, give other players the chance to Neigh it, and if it
survives, resolve it.

- Double Dutch raises this to two plays for the turn.
- Playing an **Instant** card (Neigh / Super Neigh) is *never* your Action, on your turn or
  anyone else's.

### 5.4 End of Turn phase
Discard down to the hand limit of **7** cards. You choose which to discard.

Then the turn passes to the player on your left.

## 6. Card types

| Type | Where it goes | Notes |
|---|---|---|
| **Baby Unicorn** | Your Stable | No effect of its own. Counts as a Unicorn. If it would be sacrificed, destroyed, or returned to hand, it goes back to the **Nursery** instead. |
| **Basic Unicorn** | Your Stable | No effect. Counts as a Unicorn. |
| **Magical Unicorn** | Your Stable | Counts as a Unicorn and has an effect (on entering, at the beginning of your turn, on leaving, or continuously). |
| **Magic** | Discard pile after resolving | One-shot effect. |
| **Instant** | Discard pile after resolving | Neigh and Super Neigh. Playable out of turn; does not use an Action. |
| **Upgrade** | A Stable | Stays in play. Beneficial. May be played into any player's Stable, though normally your own. |
| **Downgrade** | A Stable | Stays in play. Detrimental. May be played into any player's Stable, though normally an opponent's. |

"Unicorn card" means Baby, Basic, or Magical Unicorn. Narwhal-named cards are Unicorns too
(Narwhal is a Basic Unicorn; Baby Narwhal is a Baby Unicorn; Alluring/Classy/Shabby/The Great
Narwhal and Narwhal Torpedo are Magical Unicorns).

## 7. Keywords

| Keyword | Meaning |
|---|---|
| **DRAW** | Take the top card of the deck into your hand. |
| **DISCARD** | Move a card from **your hand** to the discard pile. |
| **SACRIFICE** | Move a card from **your own Stable** to the discard pile. |
| **DESTROY** | Move a card from **another player's Stable** to the discard pile. |
| **STEAL** | Move a card from **another player's Stable** into **your** Stable. |
| **PULL** | Take a card at random from another player's hand. |
| **Return to hand** | Move a card from a Stable back to its owner's hand. |
| **Enters your Stable** | Any way a card arrives: played, stolen, moved, or brought in by an effect. Triggers "when this card enters your Stable" effects. |
| **Leaves your Stable** | Sacrificed, destroyed, stolen, moved, or returned to hand. |

Notes that matter for implementation:

- SACRIFICE and DESTROY differ only in *whose* Stable is targeted. A card that says
  "SACRIFICE or DESTROY a card" lets you pick either.
- A Baby Unicorn intercepts SACRIFICE / DESTROY / return-to-hand and goes to the Nursery.
  The effect still counts as having happened.
- Cards that move between Stables (STEAL, Re-Target, Unicorn Swap) count as **leaving** one
  Stable and **entering** another, so both sets of triggers fire.

## 8. Neigh rules

- A Neigh may be played whenever **another** player tries to play a card. Announce it before
  the card resolves.
- The Neigh'd card goes to the discard pile without its effect happening.
- A Neigh can itself be Neigh'd. This chains: the last un-Neigh'd card in the chain wins.
  An even number of Neighs on top of the original card means the original resolves; an odd
  number means it does not.
- **Super Neigh cannot be Neigh'd**, by a Neigh or by another Super Neigh.
- You cannot Neigh a card *effect* — only the act of playing a card from hand. Beginning of
  Turn triggers, on-enter triggers, and abilities of cards already in a Stable are immune.
- If the turn player's Action-phase card gets Neigh'd, their Action is still spent. They do
  not get to play another card.
- Yay (Upgrade) makes its controller's cards un-Neigh-able. Slowdown (Downgrade) and
  Ginormous Unicorn stop their controller from playing Neighs at all.

## 9. Other rules

- **Deck runs out:** shuffle the discard pile to form a new draw pile. Baby Unicorns are
  never in the discard pile, so they are never shuffled back in.
- **Nursery runs out:** effects that would bring in a Baby Unicorn simply do nothing.
- **Optional vs mandatory:** *"you may"* is optional; everything else is mandatory if it can
  be done at all. If a mandatory effect cannot be carried out, skip the part that is
  impossible.
- **Targeting yourself:** unless a card says "another player", "any player" includes you.
  Cards that say "each player (including you)" are explicit about it.
- **Simultaneous triggers:** the active player chooses the order of their own; otherwise
  resolve in turn order starting from the active player. **[unverified]**

## 10. Two-player game

The win condition is 7 Unicorns, same as 3–5 players. The rulebook has a short 2-player
section whose exact contents could not be confirmed from this environment — sources disagree
on whether it changes the win total or adds starting Neighs. **[unverified — check the
printed rulebook before implementing a 2-player variant.]**

## 11. Edition note

The base set exists in two printings and they are **not** the same card list:

- **2nd Edition** (current, and what this project targets) adds Dark Angel Unicorn, Mother
  Goose Unicorn, Necromancer Unicorn, Queen Bee Unicorn, Unicorn Oracle, Kiss of Life,
  Caffeine Overload, Claw Machine, Rainbow Lasso, Stable Artillery, Pandamonium, and Tiny
  Stable.
- **1st Edition / Classic** instead has Angel Unicorn, Extremely Fertile Unicorn, Zombie
  Unicorn, Puppicorn, Unicorn Shrinkray, Extra Tail, Rainbow Mane, Summoning Ritual, and
  Unicorn Lasso, and carries 3 Super Neighs instead of 1.

Many cards that appear in both were also **re-worded** in 2nd Edition (Seductive Unicorn,
Unicorn Phoenix, Ginormous Unicorn, Chainsaw Unicorn, Magical Kittencorn, Blinding Light,
Slowdown, Targeted Destruction). Use the 2nd Edition text.

## Sources and confidence

Outbound network access in this environment is restricted to GitHub and package registries,
so the official rulebook PDF, unstablegames.com, and the Unstable Games Wiki could not be
fetched directly. What was used instead:

- **Card list and card text** — a 2nd Edition base-set card export (with Unstable Games Wiki
  catalogue numbers) from
  [gui-baeta/Unstable-Unicorns-Custom-Set-Builder-for-Cockatrice](https://github.com/gui-baeta/Unstable-Unicorns-Custom-Set-Builder-for-Cockatrice),
  cross-checked against the card definitions in
  [geniegeist/unstable-unicorns](https://github.com/geniegeist/unstable-unicorns) and the
  1st Edition data in [kedarv/unstable](https://github.com/kedarv/unstable). The two
  independent 2nd Edition sources agree on names, counts, and effects; the count reconciles
  exactly to the published 135-card box (127 playable + 8 rule cards).
- **Rules** — search-result extracts from the
  [Unstable Games Wiki 2nd Edition rules](https://www.unstablegameswiki.com/index.php?title=Unstable_Unicorns_-_Second_Edition_Rules),
  [Unstable Games Wiki general player rules](https://www.unstablegameswiki.com/index.php?title=Unstable_Unicorns_-_General_Player_Rules),
  [officialgamerules.org](https://officialgamerules.org/game-rules/unstable-unicorns/), and
  [UltraBoardGames](https://www.ultraboardgames.com/unstable-unicorns/game-rules.php),
  plus the hand-limit and starting-hand constants used by the geniegeist implementation.

Confidence is high on components, setup, turn structure, keywords, and Neigh handling;
low on the 2-player variant and on simultaneous-trigger ordering.
