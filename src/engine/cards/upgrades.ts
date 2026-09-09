import { defineCard } from '../registry';
import { isUnicornType, typeOf } from '../queries';

defineCard('glitter-bomb', {
  onBeginTurn(ctx) {
    const me = ctx.controller;
    const s = ctx.chooseCard(me, [...ctx.stable(me)], 'Glitter Bomb: SACRIFICE a card to DESTROY a card?', { optional: true });
    if (s === null) return;
    ctx.sacrifice(s);
    const t = ctx.chooseCard(me, ctx.stableCardsIn(ctx.others()), 'DESTROY which card?');
    if (t !== null) ctx.destroy(t);
  },
});

defineCard('yay', { neighImmunity: true });

defineCard('rainbow-aura', {
  protectsOthers: (state, ev) => ev.kind === 'destroy' && isUnicornType(typeOf(state, ev.card)),
});

defineCard('double-dutch', {
  beginTurn: 'auto',
  onBeginTurn(ctx) {
    ctx.state.turn.playsRemaining = 2;
    ctx.log(`${ctx.playerName(ctx.controller)} may play 2 cards this turn (Double Dutch).`);
  },
});

defineCard('claw-machine', {
  onBeginTurn(ctx) {
    const me = ctx.controller;
    if (ctx.hand(me).length === 0) return;
    if (!ctx.confirm(me, 'Claw Machine: DISCARD a card to DRAW a card?')) return;
    ctx.discardChoose(me, 1);
    ctx.draw(me, 1);
  },
});

defineCard('stable-artillery', {
  onBeginTurn(ctx) {
    const me = ctx.controller;
    if (ctx.hand(me).length < 2 || ctx.unicornsIn(ctx.others()).length === 0) return;
    if (!ctx.confirm(me, 'Stable Artillery: DISCARD 2 cards to DESTROY a Unicorn?')) return;
    ctx.discardChoose(me, 2);
    const t = ctx.chooseCard(me, ctx.unicornsIn(ctx.others()), 'DESTROY which Unicorn?');
    if (t !== null) ctx.destroy(t);
  },
});

defineCard('rainbow-lasso', {
  onBeginTurn(ctx) {
    const me = ctx.controller;
    const targets = ctx.unicornsIn(ctx.others()).filter((c) => ctx.canEnter(c, me));
    if (ctx.hand(me).length < 3 || targets.length === 0) return;
    if (!ctx.confirm(me, 'Rainbow Lasso: DISCARD 3 cards to STEAL a Unicorn?')) return;
    ctx.discardChoose(me, 3);
    const t = ctx.chooseCard(me, ctx.unicornsIn(ctx.others()).filter((c) => ctx.canEnter(c, me)), 'STEAL which Unicorn?');
    if (t !== null) ctx.steal(t, me);
  },
});

defineCard('caffeine-overload', {
  onBeginTurn(ctx) {
    const me = ctx.controller;
    const s = ctx.chooseCard(me, [...ctx.stable(me)], 'Caffeine Overload: SACRIFICE a card to DRAW 2 cards?', { optional: true });
    if (s === null) return;
    ctx.sacrifice(s);
    ctx.draw(me, 2);
  },
});
