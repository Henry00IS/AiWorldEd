import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { harnessCollaborationRelayUp, type HarnessCollaborationEditor } from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClose,
  harnessRelayConverged,
  harnessRelayJoin,
  harnessRelayRoomBuilt,
} from './harness_collaboration_relay.js';
import { isSolidCsgGroup, markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';

let relayUp = false;

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});

afterEach(harnessRelayClose);

/**
 * Builds a solid model whose root holds a brush, a CSG group with one brush,
 * and a trailing brush.
 *
 * @param owner Owner client.
 */
function sceneBuild(owner: HarnessCollaborationEditor): void {
  const model = owner.solidAdd('Solid');
  const [first, second] = model.getBrushes();
  const group = new THREE.Group();
  group.name = 'Group';
  markAsSolidCsgGroup(group);
  model.root.add(group);
  if (first?.mesh) group.add(first.mesh);
  if (second?.mesh) model.root.add(second.mesh);
  model.syncBrushOrderFromScene();
}

/**
 * Lists the brush and group names under the model root.
 *
 * @param client Client.
 * @returns Child names in scene order.
 */
function rootChildNames(client: HarnessCollaborationEditor): string[] {
  return client
    .object('Solid')
    .children.filter((child) => SolidBrushVisual.isBrushObject(child) || isSolidCsgGroup(child))
    .map((child) => child.name);
}

/** Relay tests for brushes added beside a selected CSG group. */
describe('collaboration insert beside a selected group over the relay', { timeout: 20000 }, () => {
  it('syncs a brush added after a selected group, and its undo and redo', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('insert slot', sceneBuild);
    const alice = await harnessRelayJoin(room, 'Alice');
    await alice.select('Group');
    alice.solids().addBoxBrush();
    const created = alice.selection.getLastSelectedObject();
    expect(created?.parent?.name).toBe('Solid');
    const expected = rootChildNames(alice);
    expect(expected.indexOf(created?.name ?? '')).toBe(expected.indexOf('Group') + 1);
    await alice.editEnd();
    alice.commit();
    await harnessRelayConverged([owner, alice]);
    expect(rootChildNames(owner)).toEqual(expected);
    expect(alice.commandStack.undo()).toBe(true);
    alice.commit();
    await harnessRelayConverged([owner, alice]);
    expect(rootChildNames(owner)).not.toContain(created?.name);
    expect(alice.commandStack.redo()).toBe(true);
    alice.commit();
    await harnessRelayConverged([owner, alice]);
    expect(rootChildNames(owner)).toEqual(expected);
  });
});
