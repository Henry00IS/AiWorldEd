import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { TrackerCollaboration } from '@/collaboration/sync/tracker_collaboration_commit.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackStatusRead } from '@/modifier/stack/evaluate/modifier_stack_status.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';
import { modifierStackParameterSet } from '@/modifier/stack/modifier_stack_operations.js';

/**
 * Builds an owner with a solid covered by a Physics Shatter Volume, and a
 * joiner synced to it.
 *
 * @returns Owner tracker, joiner and the owner's volume.
 */
function shatterPair() {
  const owner = new ReplicaCollaborationScene(new THREE.Group());
  owner.locks.selfSet(1);
  owner.baselineInitialize();
  const joiner = new ReplicaCollaborationScene(new THREE.Group());
  joiner.locks.selfSet(2);
  joiner.snapshotApply(JSON.parse(JSON.stringify(owner.snapshotStates())));
  const tracker = new TrackerCollaboration(owner, 1 << 22);
  const model = new SolidModel('Solid');
  model.addBoxBrush(1, SolidOperation.Additive);
  const volume = modifierVolumeTemplateCreate('physicsShatter');
  volume.scale.setScalar(2);
  owner.world.add(model.root, volume);
  joiner.remoteApply(JSON.parse(JSON.stringify(tracker.commit().ops)));
  return { joiner, tracker, volume };
}

/**
 * Returns the joiner's copy of an object.
 *
 * @param replica Replica.
 * @param uuid Node id.
 * @returns Object.
 */
function replicaObject(replica: ReplicaCollaborationScene, uuid: string): THREE.Object3D {
  replica.applier.invalidate();
  const object = replica.applier.nodes().get(uuid)?.object;
  if (!object) throw new Error(`missing ${uuid}`);
  return object;
}

describe('collaboration of Physics Shatter volumes', () => {
  it('fractures the joiner copy into the same pieces', () => {
    const { joiner, volume } = shatterPair();
    const remote = replicaObject(joiner, volume.uuid);
    expect(modifierStackStatusRead(remote)?.derived ?? 0).toBeGreaterThan(1);
  });

  it('syncs fracture settings and the hidden bake parameters', () => {
    const { joiner, tracker, volume } = shatterPair();
    const before = ModifierVolume.read(volume);
    const step = before.modifiers[0]?.id ?? '';
    let stack = modifierStackParameterSet(before, step, 'seed', 7);
    stack = modifierStackParameterSet(stack, step, 'crackSize', 0.25);
    stack = modifierStackParameterSet(stack, step, 'bake', 'AAECAwQF');
    stack = modifierStackParameterSet(stack, step, 'bakeHash', '0123456789abcdef');
    ModifierVolume.write(volume, stack);
    joiner.remoteApply(JSON.parse(JSON.stringify(tracker.commit().ops)));
    const remote = replicaObject(joiner, volume.uuid);
    const synced = ModifierVolume.read(remote).modifiers[0]?.parameters;
    expect(synced).toMatchObject({ seed: 7, crackSize: 0.25, bake: 'AAECAwQF', bakeHash: '0123456789abcdef' });
    expect(modifierStackStatusRead(remote)?.derived ?? 0).toBeGreaterThan(8);
  });
});
