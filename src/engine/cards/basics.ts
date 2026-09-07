import { defineCard } from '../registry';
import type { Ctx } from '../effects';
import type { RemovalEvent } from '../types';

// ---- Baby Unicorns: identical behaviour, 13 art variants ----
const BABIES = [
  'baby-unicorn-red', 'baby-unicorn-pink', 'baby-unicorn-orange', 'baby-unicorn-yellow',
  'baby-unicorn-green', 'baby-unicorn-blue', 'baby-unicorn-purple', 'baby-unicorn-black',
  'baby-unicorn-white', 'baby-unicorn-brown', 'baby-unicorn-rainbow', 'baby-unicorn-death',
  'baby-narwhal',
];
for (const id of BABIES) {
  defineCard(id, {
    replaceRemoval(ctx: Ctx, ev: RemovalEvent) {
      // sacrificed, destroyed, or returned to hand -> Nursery instead
      ctx.leaveStableTo(ev.card, 'nursery', ev.owner);
      return 'replaced';
    },
  });
}

// ---- Basic Unicorns ----
for (const id of [
  'basic-unicorn-red', 'basic-unicorn-orange', 'basic-unicorn-yellow', 'basic-unicorn-green',
  'basic-unicorn-blue', 'basic-unicorn-indigo', 'basic-unicorn-purple', 'narwhal',
]) defineCard(id, {});

// ---- Instants: behaviour lives in the stack logic in game.ts ----
defineCard('neigh', {});
defineCard('super-neigh', {});
