import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  harnessCollaborationRelayUp,
  harnessCollaborationUntil,
  type HarnessCollaborationEditor,
} from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClose,
  harnessRelayConverged,
  harnessRelayJoin,
  harnessRelayRoomBuilt,
} from './harness_collaboration_relay.js';
import { CommandHierarchyDuplicate } from '@/outliner/commands/command_hierarchy_duplicate.js';
import { hierarchyDuplicateKindOf } from '@/outliner/hierarchy/hierarchy_duplicate_clone.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

let relayUp = false;

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});

afterEach(harnessRelayClose);

/**
 * Builds a solid model Hall holding a Columns group (a brush, a Column and an
 * Inner group with a bevel volume) followed by an Outer group, and a plain
 * Props group with a cube next to it.
 *
 * @param owner Owner client.
 */
function sceneBuild(owner: HarnessCollaborationEditor): void {
  const model = owner.solidAdd('Hall');
  const group = (name: string, parent: THREE.Object3D): THREE.Group => {
    const created = new THREE.Group();
    created.name = name;
    markAsSolidCsgGroup(created, SolidOperation.Additive);
    parent.add(created);
    return created;
  };
  const columns = group('Columns', model.root);
  columns.add(model.addBoxBrush(1, SolidOperation.Additive).mesh!);
  const column = modifierGeneratorNodeCreate('column');
  column.name = 'Column A';
  columns.add(column);
  const inner = group('Inner', columns);
  const bevel = modifierVolumeTemplateCreate('bevel');
  bevel.name = 'Bevel A';
  inner.add(bevel);
  group('Outer', model.root).add(model.addBoxBrush(1, SolidOperation.Additive).mesh!);
  model.syncBrushOrderFromScene();
  const props = owner.groupAdd('Props');
  owner.boxAdd('Box A', props);
}

/**
 * Lists a node's content children by name.
 *
 * @param object Node.
 * @returns Child names in order.
 */
function contentNames(object: THREE.Object3D): string[] {
  return object.children.filter((child) => hierarchyDuplicateKindOf(child) !== 'helper').map((child) => child.name);
}

/**
 * Describes a subtree by kind and child order.
 *
 * @param object Node.
 * @returns Nested description.
 */
function shape(object: THREE.Object3D): unknown {
  const children = object.children.filter((child) => hierarchyDuplicateKindOf(child) !== 'helper');
  return { kind: hierarchyDuplicateKindOf(object), children: children.map(shape) };
}

/**
 * Duplicates a node on one client and waits until another client has the copy.
 *
 * @param from Client that duplicates.
 * @param to Client that receives the copy.
 * @param name Source node name.
 * @returns Copy name.
 */
async function duplicateSeen(
  from: HarnessCollaborationEditor,
  to: HarnessCollaborationEditor,
  name: string,
): Promise<string> {
  const command = new CommandHierarchyDuplicate([from.object(name)], new THREE.Vector3());
  from.commandStack.push(command);
  from.commit();
  const copyName = command.getClones()[0]!.name;
  await harnessCollaborationUntil(() => to.find(copyName) !== undefined, 5000, 'copy seen');
  return copyName;
}

/** Duplicate in a room puts the same copy in the same place for every member. */
describe('collaboration duplicate over the relay', { timeout: 20000 }, () => {
  it('shows a copied CSG group right after its source on every member', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('dup csg group', sceneBuild);
    const alice = await harnessRelayJoin(room, 'Alice');
    const copyName = await duplicateSeen(owner, alice, 'Columns');
    await harnessRelayConverged([owner, alice]);
    expect(contentNames(alice.object('Hall'))).toEqual(contentNames(owner.object('Hall')));
    expect(contentNames(alice.object('Hall')).indexOf(copyName)).toBe(
      contentNames(alice.object('Hall')).indexOf('Columns') + 1,
    );
    expect(shape(alice.object(copyName))).toEqual(shape(owner.object('Columns')));
  });

  it('shows a copied plain group right after its source on every member', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('dup plain group', sceneBuild);
    const alice = await harnessRelayJoin(room, 'Alice');
    const copyName = await duplicateSeen(alice, owner, 'Props');
    await harnessRelayConverged([owner, alice]);
    expect(contentNames(owner.world)).toEqual(contentNames(alice.world));
    expect(contentNames(owner.world).indexOf(copyName)).toBe(contentNames(owner.world).indexOf('Props') + 1);
    expect(shape(owner.object(copyName))).toEqual(shape(alice.object('Props')));
  });
});
