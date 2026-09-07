import { defineCard } from '../registry';

defineCard('barbed-wire', {
  onUnicornEntered(ctx) { ctx.discardChoose(ctx.controller, 1, 'Barbed Wire: DISCARD a card'); },
  onUnicornLeft(ctx) { ctx.discardChoose(ctx.controller, 1, 'Barbed Wire: DISCARD a card'); },
});

defineCard('pandamonium', {
  // Pandas are handled by the isPanda query: they are not Unicorn cards and count 0 toward winning.
});

defineCard('sadistic-ritual', {
  onBeginTurn(ctx) {
    const me = ctx.controller;
    const c = ctx.chooseCard(me, ctx.unicornsIn([me]), 'Sadistic Ritual: SACRIFICE a Unicorn');
    if (c === null) return;
    ctx.sacrifice(c);
    ctx.draw(me, 1);
  },
});

defineCard('slowdown', {
  vetoPlay(state, _controller, card) {
    const d = state.cards[card]!.def;
    return d === 'neigh' || d === 'super-neigh' ? 'Slowdown: you cannot play Neigh cards' : null;
  },
});

defineCard('nanny-cam', {
  // hand visibility is applied in viewFor()
});

defineCard('broken-stable', {
  vetoPlay(state, _controller, card) {
    return isUpgrade(state.cards[card]!.def) ? 'Broken Stable: you cannot play Upgrade cards' : null;
  },
});

const UPGRADES = new Set(['glitter-bomb', 'yay', 'rainbow-aura', 'double-dutch', 'claw-machine', 'stable-artillery', 'rainbow-lasso', 'caffeine-overload']);
function isUpgrade(def: string): boolean { return UPGRADES.has(def); }

defineCard('blinding-light', {
  // handled by the isBlinded query: the controller's Unicorn effects are ignored.
});

defineCard('tiny-stable', {
  onStableChanged(ctx) {
    const me = ctx.controller;
    while (ctx.unicornCount(me) > 5) {
      const options = ctx.unicornTypesIn([me]);
      const c = ctx.chooseCard(me, options, 'Tiny Stable: you have more than 5 Unicorns. SACRIFICE one.');
      if (c === null) return;
      const before = ctx.unicornCount(me);
      ctx.sacrifice(c);
      if (ctx.unicornCount(me) >= before) return; // replaced (e.g. Phoenix); avoid looping forever
    }
  },
});
