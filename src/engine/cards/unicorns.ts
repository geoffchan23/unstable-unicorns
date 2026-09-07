import { defineCard } from '../registry';
import type { Ctx } from '../effects';
import type { RemovalEvent } from '../types';

// ---------- helpers ----------

/** Flyers: "If this card is sacrificed or destroyed, return it to your hand." */
function flyer(ctx: Ctx, ev: RemovalEvent): 'replaced' | null {
  if (ev.kind !== 'destroy' && ev.kind !== 'sacrifice') return null;
  ctx.leaveStableTo(ev.card, 'hand', ev.owner);
  return 'replaced';
}

function destroyUnicorn(ctx: Ctx, me: number, message: string, optional: boolean): boolean {
  const options = ctx.unicornsIn(ctx.allPlayers()).filter((c) => c !== me);
  const t = ctx.chooseCard(ctx.controller, options, message, { optional });
  if (t === null) return false;
  ctx.destroy(t);
  return true;
}

// ---------- UU-Base-022..050, 085..088 ----------

defineCard('rhinocorn', {
  onBeginTurn(ctx) {
    const options = ctx.unicornsIn(ctx.allPlayers()).filter((c) => c !== ctx.self);
    const t = ctx.chooseCard(ctx.controller, options, 'Rhinocorn: DESTROY a Unicorn and end your turn?', { optional: true });
    if (t === null) return;
    ctx.destroy(t);
    ctx.endTurn();
  },
});

defineCard('magical-kittencorn', {
  replaceRemoval(_ctx, ev) {
    return ev.kind === 'destroy' && ev.byMagic ? 'immune' : null;
  },
});

defineCard('stabby-the-unicorn', {
  onLeave(ctx) {
    destroyUnicorn(ctx, ctx.self, 'Stabby the Unicorn: DESTROY a Unicorn?', true);
  },
});

defineCard('rainbow-unicorn', {
  onEnter(ctx) {
    const me = ctx.controller;
    const options = ctx.handOfType(me, (c) => ctx.isBasic(c) && ctx.canEnter(c, me));
    const c = ctx.chooseCard(me, options, 'Rainbow Unicorn: bring a Basic Unicorn from your hand into your Stable?', { optional: true });
    if (c !== null) ctx.enterStable(c, me, 'bring');
  },
});

defineCard('extremely-destructive-unicorn', {
  onEnter(ctx) {
    for (const p of ctx.allPlayers()) {
      const options = ctx.unicornsIn([p]);
      const c = ctx.chooseCard(p, options, 'Extremely Destructive Unicorn: SACRIFICE a Unicorn');
      if (c !== null) ctx.sacrifice(c);
    }
  },
});

defineCard('chainsaw-unicorn', {
  onEnter(ctx) {
    const me = ctx.controller;
    const options = [...ctx.ofType(ctx.others(), 'upgrade'), ...ctx.ofType([me], 'upgrade'), ...ctx.ofType([me], 'downgrade')];
    const c = ctx.chooseCard(me, options, 'Chainsaw Unicorn: DESTROY an Upgrade or SACRIFICE a Downgrade?', { optional: true });
    if (c === null) return;
    if (ctx.owner(c) === me) ctx.sacrifice(c); else ctx.destroy(c);
  },
});

defineCard('llamacorn', {
  onEnter(ctx) {
    for (const p of ctx.allPlayers()) ctx.discardChoose(p, 1, 'Llamacorn: DISCARD a card');
  },
});

defineCard('americorn', {
  onEnter(ctx) {
    const me = ctx.controller;
    const targets = ctx.others().filter((p) => ctx.hand(p).length > 0);
    const p = ctx.choosePlayer(me, targets, 'Americorn: pull a random card from which player?', true);
    if (p === null) return;
    const c = ctx.randomFromHand(p);
    if (c !== null) {
      ctx.addToHand(c, me);
      ctx.log(`${ctx.playerName(me)} pulls a card from ${ctx.playerName(p)}'s hand.`);
    }
  },
});

defineCard('ginormous-unicorn', {
  unicornValue: () => 2,
  vetoPlay(state, _controller, card) {
    return state.cards[card]!.def === 'neigh' || state.cards[card]!.def === 'super-neigh'
      ? 'Ginormous Unicorn: you cannot play Neigh cards' : null;
  },
});

defineCard('seductive-unicorn', {
  onEnter(ctx) {
    const me = ctx.controller;
    const targets = ctx.unicornsIn(ctx.others()).filter((c) => ctx.canEnter(c, me));
    if (ctx.hand(me).length === 0 || targets.length === 0) return;
    if (!ctx.confirm(me, 'Seductive Unicorn: DISCARD a card to STEAL a Unicorn?')) return;
    ctx.discardChoose(me, 1);
    const t = ctx.chooseCard(me, targets, 'STEAL which Unicorn?');
    if (t !== null) ctx.steal(t, me);
  },
});

defineCard('queen-bee-unicorn', {
  vetoEntry(state, controller, card, into) {
    return into !== controller && state.cards[card] && cardIsBasic(state.cards[card]!.def)
      ? 'Queen Bee Unicorn: Basic Unicorns cannot enter other stables' : null;
  },
});

function cardIsBasic(def: string): boolean {
  return def.startsWith('basic-unicorn') || def === 'narwhal';
}

defineCard('greedy-flying-unicorn', {
  onEnter(ctx) { ctx.draw(ctx.controller, 1); },
  replaceRemoval: flyer,
});

defineCard('annoying-flying-unicorn', {
  onEnter(ctx) {
    const me = ctx.controller;
    const targets = ctx.allPlayers().filter((p) => ctx.hand(p).length > 0);
    const p = ctx.choosePlayer(me, targets, 'Annoying Flying Unicorn: which player must DISCARD a card?', true);
    if (p !== null) ctx.discardChoose(p, 1, 'Annoying Flying Unicorn: DISCARD a card');
  },
  replaceRemoval: flyer,
});

defineCard('magical-flying-unicorn', {
  onEnter(ctx) {
    const me = ctx.controller;
    const c = ctx.chooseCard(me, ctx.discardOfType((x) => ctx.isMagic(x)), 'Magical Flying Unicorn: take a Magic card from the discard pile?', { optional: true });
    if (c !== null) ctx.addToHand(c, me);
  },
  replaceRemoval: flyer,
});

defineCard('swift-flying-unicorn', {
  onEnter(ctx) {
    const me = ctx.controller;
    const c = ctx.chooseCard(me, ctx.discardOfType((x) => ctx.isNeigh(x)), 'Swift Flying Unicorn: take a Neigh card from the discard pile?', { optional: true });
    if (c !== null) ctx.addToHand(c, me);
  },
  replaceRemoval: flyer,
});

defineCard('majestic-flying-unicorn', {
  onEnter(ctx) {
    const me = ctx.controller;
    const c = ctx.chooseCard(me, ctx.discardOfType((x) => ctx.isUnicorn(x)), 'Majestic Flying Unicorn: take a Unicorn card from the discard pile?', { optional: true });
    if (c !== null) ctx.addToHand(c, me);
  },
  replaceRemoval: flyer,
});

defineCard('unicorn-phoenix', {
  replaceRemoval(ctx, ev) {
    if (ev.kind !== 'destroy' && ev.kind !== 'sacrifice') return null;
    if (ctx.hand(ev.owner).length === 0) return null;
    if (!ctx.confirm(ev.owner, `Unicorn Phoenix would be ${ev.kind === 'destroy' ? 'destroyed' : 'sacrificed'}. DISCARD a card instead?`)) return null;
    ctx.discardChoose(ev.owner, 1);
    return 'replaced';
  },
});

defineCard('unicorn-on-the-cob', {
  onEnter(ctx) {
    ctx.draw(ctx.controller, 2);
    ctx.discardChoose(ctx.controller, 1, 'Unicorn on the Cob: DISCARD a card');
  },
});

defineCard('black-knight-unicorn', {
  protectOther(ctx, ev) {
    if (ev.kind !== 'destroy' || !ctx.isUnicorn(ev.card)) return null;
    if (!ctx.confirm(ev.owner, `${ctx.name(ev.card)} would be destroyed. SACRIFICE Black Knight Unicorn instead?`)) return null;
    ctx.sacrifice(ctx.self);
    return 'replaced';
  },
});

defineCard('shark-with-a-horn', {
  onEnter(ctx) {
    const me = ctx.controller;
    const targets = ctx.unicornsIn(ctx.allPlayers()).filter((c) => c !== ctx.self);
    if (targets.length === 0) return;
    if (!ctx.confirm(me, 'Shark With a Horn: SACRIFICE it to DESTROY a Unicorn?')) return;
    if (!ctx.sacrifice(ctx.self)) return;
    const t = ctx.chooseCard(me, ctx.unicornsIn(ctx.allPlayers()), 'DESTROY which Unicorn?');
    if (t !== null) ctx.destroy(t);
  },
});

defineCard('shabby-the-narwhal', {
  onEnter(ctx) {
    ctx.searchDeck(ctx.controller, (c) => ctx.type(c) === 'downgrade', 'Shabby the Narwhal: take a Downgrade card from the deck?');
  },
});

defineCard('narwhal-torpedo', {
  onEnter(ctx) {
    for (const c of ctx.ofType([ctx.controller], 'downgrade')) ctx.sacrifice(c);
  },
});

defineCard('alluring-narwhal', {
  onEnter(ctx) {
    const me = ctx.controller;
    const t = ctx.chooseCard(me, ctx.ofType(ctx.others(), 'upgrade'), 'Alluring Narwhal: STEAL an Upgrade card?', { optional: true });
    if (t !== null) ctx.steal(t, me);
  },
});

defineCard('mermaid-unicorn', {
  onEnter(ctx) {
    const me = ctx.controller;
    const targets = ctx.allPlayers().filter((p) => ctx.stable(p).some((c) => c !== ctx.self));
    const p = ctx.choosePlayer(me, targets, 'Mermaid Unicorn: return a card in which player\'s Stable to their hand?', true);
    if (p === null) return;
    const c = ctx.chooseCard(me, ctx.stable(p).filter((x) => x !== ctx.self), 'Return which card?');
    if (c !== null) ctx.returnToHand(c);
  },
});

defineCard('classy-narwhal', {
  onEnter(ctx) {
    ctx.searchDeck(ctx.controller, (c) => ctx.type(c) === 'upgrade', 'Classy Narwhal: take an Upgrade card from the deck?');
  },
});

defineCard('the-great-narwhal', {
  onEnter(ctx) {
    ctx.searchDeck(ctx.controller, (c) => ctx.hasNameContaining(c, 'narwhal'), 'The Great Narwhal: take a Narwhal card from the deck?');
  },
});

defineCard('mother-goose-unicorn', {
  onEnter(ctx) {
    const me = ctx.controller;
    const baby = ctx.state.nursery[ctx.state.nursery.length - 1];
    if (baby === undefined) return;
    if (!ctx.confirm(me, 'Mother Goose Unicorn: bring a Baby Unicorn from the Nursery into your Stable?')) return;
    ctx.enterStable(baby, me, 'bring');
  },
});

defineCard('unicorn-oracle', {
  onEnter(ctx) {
    const me = ctx.controller;
    const deck = ctx.state.deck;
    const top = deck.slice(-3).reverse(); // top of deck is the end of the array
    if (top.length === 0) return;
    const pick = ctx.chooseCard(me, top, 'Unicorn Oracle: add which of the top 3 cards to your hand?');
    if (pick === null) return;
    ctx.addToHand(pick, me);
    const rest = top.filter((c) => c !== pick);
    if (rest.length === 2) {
      const first = ctx.chooseCard(me, rest, 'Which card goes on top of the deck?');
      const second = rest.find((c) => c !== first)!;
      ctx.toDeckTop(second);
      ctx.toDeckTop(first!);
    }
  },
});

defineCard('necromancer-unicorn', {
  onEnter(ctx) {
    const me = ctx.controller;
    const unis = ctx.handOfType(me, (c) => ctx.isUnicorn(c));
    if (unis.length < 2) return;
    if (!ctx.confirm(me, 'Necromancer Unicorn: DISCARD 2 Unicorn cards to bring a Unicorn from the discard pile into your Stable?')) return;
    const picks = ctx.chooseCards(me, unis, 2, 'DISCARD which 2 Unicorn cards?');
    for (const c of picks) ctx.discardCard(me, c);
    const t = ctx.chooseCard(me, ctx.discardOfType((c) => ctx.isUnicorn(c) && ctx.canEnter(c, me)), 'Bring which Unicorn into your Stable?');
    if (t !== null) ctx.enterStable(t, me, 'bring');
  },
});

defineCard('dark-angel-unicorn', {
  onEnter(ctx) {
    const me = ctx.controller;
    const options = ctx.unicornsIn([me]);
    const s = ctx.chooseCard(me, options, 'Dark Angel Unicorn: SACRIFICE a Unicorn to bring one back from the discard pile?', { optional: true });
    if (s === null) return;
    ctx.sacrifice(s);
    const t = ctx.chooseCard(me, ctx.discardOfType((c) => ctx.isUnicorn(c) && ctx.canEnter(c, me)), 'Bring which Unicorn into your Stable?');
    if (t !== null) ctx.enterStable(t, me, 'bring');
  },
});
