import { defineCard } from '../registry';

const M = { byMagic: true };

defineCard('unicorn-poison', {
  onPlayMagic(ctx) {
    const t = ctx.chooseCard(ctx.controller, ctx.unicornsIn(ctx.allPlayers()), 'Unicorn Poison: DESTROY which Unicorn?');
    if (t !== null) ctx.destroy(t, M);
  },
});

defineCard('back-kick', {
  onPlayMagic(ctx) {
    const me = ctx.controller;
    const targets = ctx.others().filter((p) => ctx.stable(p).length > 0);
    const p = ctx.choosePlayer(me, targets, 'Back Kick: which player?');
    if (p === null) return;
    const c = ctx.chooseCard(me, [...ctx.stable(p)], 'Return which card to their hand?');
    if (c !== null) ctx.returnToHand(c, M);
    ctx.discardChoose(p, 1, 'Back Kick: DISCARD a card');
  },
});

defineCard('change-of-luck', {
  onPlayMagic(ctx) {
    ctx.draw(ctx.controller, 2);
    ctx.discardChoose(ctx.controller, 3, 'Change of Luck: DISCARD a card');
    ctx.extraTurn();
  },
});

defineCard('glitter-tornado', {
  onPlayMagic(ctx) {
    const me = ctx.controller;
    for (const p of ctx.allPlayers()) {
      const c = ctx.chooseCard(me, [...ctx.stable(p)], `Glitter Tornado: return which card in ${ctx.playerName(p)}'s Stable?`);
      if (c !== null) ctx.returnToHand(c, M);
    }
  },
});

defineCard('unicorn-swap', {
  onPlayMagic(ctx) {
    const me = ctx.controller;
    const mine = ctx.unicornsIn([me]);
    const give = ctx.chooseCard(me, mine, 'Unicorn Swap: move which of your Unicorns?');
    if (give === null) return;
    const p = ctx.choosePlayer(me, ctx.others().filter((o) => ctx.canEnter(give, o)), 'To which player?');
    if (p === null) return;
    ctx.enterStable(give, p, 'move');
    const t = ctx.chooseCard(me, ctx.unicornsIn([p]).filter((c) => c !== give && ctx.canEnter(c, me)), 'STEAL which Unicorn?');
    if (t !== null) ctx.steal(t, me);
  },
});

defineCard('re-target', {
  onPlayMagic(ctx) {
    const me = ctx.controller;
    const options = [...ctx.ofType(ctx.allPlayers(), 'upgrade'), ...ctx.ofType(ctx.allPlayers(), 'downgrade')];
    const c = ctx.chooseCard(me, options, 'Re-Target: move which Upgrade or Downgrade?');
    if (c === null) return;
    const from = ctx.owner(c)!;
    const to = ctx.choosePlayer(me, ctx.allPlayers().filter((p) => p !== from), 'To which player\'s Stable?');
    if (to !== null) ctx.moveBetweenStables(c, to);
  },
});

defineCard('unfair-bargain', {
  onPlayMagic(ctx) {
    const me = ctx.controller;
    const p = ctx.choosePlayer(me, ctx.others(), 'Unfair Bargain: trade hands with which player?');
    if (p === null) return;
    ctx.log(`${ctx.playerName(me)} trades hands with ${ctx.playerName(p)} (Unfair Bargain).`, [p]);
    ctx.swapHands(me, p);
  },
});

defineCard('two-for-one', {
  onPlayMagic(ctx) {
    const me = ctx.controller;
    const s = ctx.chooseCard(me, [...ctx.stable(me)], 'Two-For-One: SACRIFICE which card?');
    if (s === null) return;
    ctx.sacrifice(s, M);
    for (let i = 0; i < 2; i++) {
      const t = ctx.chooseCard(me, ctx.stableCardsIn(ctx.others()), `DESTROY which card? (${i + 1} of 2)`);
      if (t === null) break;
      ctx.destroy(t, M);
    }
  },
});

defineCard('targeted-destruction', {
  onPlayMagic(ctx) {
    const me = ctx.controller;
    const options = [...ctx.ofType(ctx.others(), 'upgrade'), ...ctx.ofType([me], 'upgrade'), ...ctx.ofType([me], 'downgrade')];
    const c = ctx.chooseCard(me, options, 'Targeted Destruction: DESTROY an Upgrade or SACRIFICE a Downgrade');
    if (c === null) return;
    if (ctx.owner(c) === me) ctx.sacrifice(c, M); else ctx.destroy(c, M);
  },
});

defineCard('mystical-vortex', {
  onPlayMagic(ctx) {
    for (const p of ctx.allPlayers()) ctx.discardChoose(p, 1, 'Mystical Vortex: DISCARD a card');
    ctx.reshuffleDiscardIntoDeck();
  },
});

defineCard('good-deal', {
  onPlayMagic(ctx) {
    ctx.draw(ctx.controller, 3);
    ctx.discardChoose(ctx.controller, 1, 'Good Deal: DISCARD a card');
  },
});

defineCard('shake-up', {
  onPlayMagic(ctx) {
    const me = ctx.controller;
    ctx.log(`${ctx.playerName(me)} shuffles their hand, the discard pile, and Shake Up into the deck.`);
    ctx.shuffleHandAndDiscardIntoDeck(me);
    ctx.toDeckTop(ctx.self);
    ctx.shuffleDeck();
    ctx.draw(me, 5);
  },
});

defineCard('blatant-thievery', {
  onPlayMagic(ctx) {
    const me = ctx.controller;
    const p = ctx.choosePlayer(me, ctx.others().filter((o) => ctx.hand(o).length > 0), 'Blatant Thievery: look at whose hand?');
    if (p === null) return;
    const c = ctx.chooseCard(me, [...ctx.hand(p)], `Take which card from ${ctx.playerName(p)}'s hand?`);
    if (c !== null) {
      ctx.addToHand(c, me);
      ctx.log(`${ctx.playerName(me)} takes a card from ${ctx.playerName(p)}'s hand.`, [p]);
    }
  },
});

defineCard('reset-button', {
  onPlayMagic(ctx) {
    for (const p of ctx.allPlayers()) {
      for (const c of [...ctx.ofType([p], 'upgrade'), ...ctx.ofType([p], 'downgrade')]) ctx.sacrifice(c, M);
    }
    ctx.reshuffleDiscardIntoDeck();
  },
});

defineCard('kiss-of-life', {
  onPlayMagic(ctx) {
    const me = ctx.controller;
    const t = ctx.chooseCard(me, ctx.discardOfType((c) => ctx.isUnicorn(c) && ctx.canEnter(c, me)), 'Kiss of Life: bring which Unicorn into your Stable?', { empty: 'no Unicorn in the discard pile could enter your Stable.' });
    if (t !== null) ctx.enterStable(t, me, 'bring');
  },
});
