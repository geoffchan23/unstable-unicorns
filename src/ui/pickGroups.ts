// Cards offered by a prompt, grouped under whose they are. Choosing what to destroy or steal out of one
// undifferentiated row of faces makes it far too easy to hit the wrong player's card, so the owner is a
// heading over each group rather than a badge in a corner.
import type { InstanceId, PlayerId } from '../engine/types';
import type { PlayerView } from '../engine/view';

export interface PickGroup {
  /** stable identity for React and tests */
  key: string;
  /** "Sprinkles's stable", "Your hand", "The discard pile" */
  label: string;
  mine: boolean;
  ids: InstanceId[];
}

/** Groups in the order the engine offered the cards, which is seat order for anything that targets players. */
export function groupByOwner(options: InstanceId[], view: PlayerView): PickGroup[] {
  const groups: PickGroup[] = [];
  for (const id of options) {
    const owner = view.players.find((p) => p.stable.includes(id) || (p.hand ?? []).includes(id));
    const zone: 'stable' | 'hand' | 'discard' | 'nursery' | 'deck' = owner
      ? (owner.stable.includes(id) ? 'stable' : 'hand')
      : view.discard.includes(id) ? 'discard' : view.nursery.includes(id) ? 'nursery' : 'deck';
    const key = owner ? `${owner.id}:${zone}` : zone;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: labelFor(owner?.id, owner?.name, zone, view.me), mine: owner?.id === view.me, ids: [] };
      groups.push(group);
    }
    group.ids.push(id);
  }
  return groups;
}

function labelFor(owner: PlayerId | undefined, name: string | undefined, zone: string, me: PlayerId): string {
  if (owner !== undefined) return `${owner === me ? 'Your' : `${name}'s`} ${zone}`;
  if (zone === 'discard') return 'The discard pile';
  if (zone === 'nursery') return 'The Nursery';
  return 'The deck';
}
