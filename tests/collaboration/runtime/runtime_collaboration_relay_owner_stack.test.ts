import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type HarnessCollaborationEditor,
  harnessCollaborationRelayUp,
  harnessCollaborationUntil,
} from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClose,
  harnessRelayJoin,
  harnessRelayRoomBuilt,
} from './harness_collaboration_relay.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import { modifierStackOwnerEncode } from '@/modifier/stack/owner/modifier_stack_owner.js';
import type { ModifierStackEntry, ModifierStackSettings } from '@/modifier/stack/modifier_stack_types.js';

let relayUp = false;
beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});
afterEach(harnessRelayClose);

/**
 * Builds a solid with a brush named Brush inside a CSG group named Group.
 *
 * @param client Room owner.
 */
function sceneBuild(client: HarnessCollaborationEditor): void {
  const model = client.solidAdd('Solid');
  const [first] = model.getBrushes();
  if (!first?.mesh) throw new Error('missing brush');
  first.mesh.name = 'Brush';
  const group = new THREE.Group();
  group.name = 'Group';
  markAsSolidCsgGroup(group);
  model.root.add(group);
  group.add(first.mesh);
  model.syncBrushOrderFromScene();
}

/**
 * Runs one stack edit through the undo stack, like the inspector does.
 *
 * @param client Editing client.
 * @param name Object name.
 * @param edit Builds the new stack from the current one.
 */
function stackEdit(
  client: HarnessCollaborationEditor,
  name: string,
  edit: (stack: ModifierStackSettings) => ModifierStackSettings,
): void {
  const object = client.object(name);
  const before = ModifierVolume.read(object);
  client.commandStack.push(new CommandModifierStackSet(object, before, edit(structuredClone(before))));
  client.commit();
}

/**
 * Summarizes the shared part of an object's stack.
 *
 * @param client Client.
 * @param name Object name.
 * @returns Kinds, enabled flags and counts, in order.
 */
function shared(client: HarnessCollaborationEditor, name: string): string {
  const stack = modifierStackOwnerEncode(client.object(name));
  return (stack?.modifiers ?? [])
    .map((step) => `${step.kind}:${step.enabled ? 1 : 0}:${String(step.parameters['count'] ?? '')}`)
    .join(',');
}

/**
 * Summarizes the built result of the solid: the world bounds of its meshes.
 *
 * @param client Client.
 * @returns Bounds text.
 */
function built(client: HarnessCollaborationEditor): string {
  const root = client.object('Solid');
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let meshes = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    meshes += 1;
    box.expandByObject(object);
  });
  return `${meshes}|${box.min
    .toArray()
    .map((v) => v.toFixed(3))
    .join(',')}|${box.max
    .toArray()
    .map((v) => v.toFixed(3))
    .join(',')}`;
}

/**
 * Waits until the peer shows the owner's stack.
 *
 * @param owner Editing client.
 * @param peer Receiving client.
 * @param name Object name.
 * @param label Step name.
 */
async function synced(
  owner: HarnessCollaborationEditor,
  peer: HarnessCollaborationEditor,
  name: string,
  label: string,
): Promise<void> {
  const expected = shared(owner, name);
  await harnessCollaborationUntil(() => shared(peer, name) === expected, 5000, `${name} ${label}`);
  expect(shared(peer, name)).toBe(expected);
  await harnessCollaborationUntil(() => built(peer) === built(owner), 5000, `${name} ${label} rebuilt`);
}

describe('modifiers on brushes and groups over relay', { timeout: 60000 }, () => {
  it.for(['Brush', 'Group'])('replicates live edits on a %s and their undo', async (name, { skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('owner stack live', sceneBuild);
    const peer = await harnessRelayJoin(room, 'Stack peer');
    owner.selectTry(name);
    const step = (id: string, kind: string, count: number): ModifierStackEntry => ({
      id,
      kind,
      name: kind,
      enabled: true,
      expanded: true,
      parameters: { count },
    });
    stackEdit(owner, name, (stack) => ({ ...stack, modifiers: [step('a', 'linear', 3)] }));
    await synced(owner, peer, name, 'added');
    stackEdit(owner, name, (stack) => ({ ...stack, modifiers: [...stack.modifiers, step('b', 'radial', 4)] }));
    await synced(owner, peer, name, 'second added');
    stackEdit(owner, name, (stack) => ({
      ...stack,
      modifiers: stack.modifiers.map((entry) => ({ ...entry, parameters: { ...entry.parameters, count: 6 } })),
    }));
    await synced(owner, peer, name, 'parameter changed');
    stackEdit(owner, name, (stack) => ({ ...stack, modifiers: [...stack.modifiers].reverse() }));
    await synced(owner, peer, name, 'reordered');
    stackEdit(owner, name, (stack) => ({
      ...stack,
      modifiers: stack.modifiers.map((entry, index) => ({ ...entry, enabled: index !== 0 })),
    }));
    await synced(owner, peer, name, 'disabled');
    stackEdit(owner, name, (stack) => ({ ...stack, modifiers: stack.modifiers.slice(1) }));
    await synced(owner, peer, name, 'removed');
    owner.commandStack.undo();
    owner.commit();
    await synced(owner, peer, name, 'undone');
    owner.commandStack.redo();
    owner.commit();
    await synced(owner, peer, name, 'redone');
    stackEdit(owner, name, (stack) => ({ ...stack, modifiers: [] }));
    await synced(owner, peer, name, 'cleared');
    expect(shared(peer, name)).toBe('');
  });
});
