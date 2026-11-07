import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { TrackerCollaboration } from '@/collaboration/sync/tracker_collaboration_commit.js';
import { nodeVolumeSyncText } from '@/collaboration/scene/node_collaboration_volume.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackStatusRead } from '@/modifier/stack/evaluate/modifier_stack_status.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';
import { modifierStackParameterSet } from '@/modifier/stack/modifier_stack_operations.js';
import type { ModifierStackValue } from '@/modifier/stack/modifier_stack_types.js';

/**
 * Builds an owner with a solid and a linear array volume, and a joiner synced
 * to it.
 *
 * @returns Owner, joiner, tracker and the owner's volume.
 */
function volumePair() {
  const owner = new ReplicaCollaborationScene(new THREE.Group());
  owner.locks.selfSet(1);
  owner.baselineInitialize();
  const joiner = new ReplicaCollaborationScene(new THREE.Group());
  joiner.locks.selfSet(2);
  joiner.snapshotApply(JSON.parse(JSON.stringify(owner.snapshotStates())));
  const tracker = new TrackerCollaboration(owner, 1 << 22);
  const model = new SolidModel('Solid');
  model.addBoxBrush(1, SolidOperation.Additive);
  const volume = modifierVolumeTemplateCreate('linear');
  volume.scale.setScalar(2);
  owner.world.add(model.root, volume);
  joiner.remoteApply(JSON.parse(JSON.stringify(tracker.commit().ops)));
  return { owner, joiner, tracker, volume };
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

/**
 * Returns how many brushes a volume made in its last evaluation.
 *
 * @param volume Volume.
 * @returns Derived brush count.
 */
function derivedCount(volume: THREE.Object3D): number {
  return modifierStackStatusRead(volume)?.derived ?? 0;
}

describe('collaboration of modifier volumes', () => {
  it('syncs stack edits in place and the joiner rebuilds the result itself', () => {
    const { joiner, tracker, volume } = volumePair();
    const remote = replicaObject(joiner, volume.uuid);
    expect(ModifierVolume.read(remote)).toEqual(ModifierVolume.read(volume));
    const before = derivedCount(remote);
    expect(before).toBe(2);
    const stack = ModifierVolume.read(volume);
    const step = stack.modifiers[0]?.id ?? '';
    ModifierVolume.write(volume, modifierStackParameterSet(stack, step, 'count', 5));
    const ops = tracker.commit().ops;
    expect(JSON.stringify(ops)).toContain('"count":5');
    joiner.remoteApply(JSON.parse(JSON.stringify(ops)));
    expect(replicaObject(joiner, volume.uuid)).toBe(remote);
    expect(ModifierVolume.read(remote).modifiers[0]?.parameters['count']).toBe(5);
    expect(derivedCount(remote)).toBe(4);
  });

  it('keeps folding local: it neither changes the fingerprint nor overwrites the peer', () => {
    const { joiner, tracker, volume } = volumePair();
    const text = nodeVolumeSyncText(volume);
    const stack = ModifierVolume.read(volume);
    const folded = { ...stack, modifiers: stack.modifiers.map((step) => ({ ...step, expanded: !step.expanded })) };
    ModifierVolume.write(volume, folded);
    expect(nodeVolumeSyncText(volume)).toBe(text);
    const remote = replicaObject(joiner, volume.uuid);
    const remoteExpanded = ModifierVolume.read(remote).modifiers[0]?.expanded;
    const step = folded.modifiers[0]?.id ?? '';
    ModifierVolume.write(volume, modifierStackParameterSet(folded, step, 'count', 4));
    joiner.remoteApply(JSON.parse(JSON.stringify(tracker.commit().ops)));
    expect(ModifierVolume.read(remote).modifiers[0]?.expanded).toBe(remoteExpanded);
    expect(nodeVolumeSyncText(remote)).toBe(nodeVolumeSyncText(volume));
  });

  it('syncs randomize, seed and cap settings so both clients build the same layout', () => {
    const { joiner, tracker, volume } = volumePair();
    let stack = ModifierVolume.read(volume);
    const step = stack.modifiers[0]?.id ?? '';
    const edits: [string, ModifierStackValue][] = [
      ['randomize', true],
      ['randomOffsetY', 0.5],
      ['randomRotationZ', 20],
      ['randomSeed', 42],
      ['uvShiftU', 0.25],
    ];
    for (const [key, value] of edits) stack = modifierStackParameterSet(stack, step, key, value);
    ModifierVolume.write(volume, stack);
    joiner.remoteApply(JSON.parse(JSON.stringify(tracker.commit().ops)));
    const remote = replicaObject(joiner, volume.uuid);
    expect(ModifierVolume.read(remote).modifiers[0]?.parameters).toEqual(
      ModifierVolume.read(volume).modifiers[0]?.parameters,
    );
    expect(ModifierVolume.read(remote).modifiers[0]?.parameters['randomSeed']).toBe(42);
  });

  it('syncs a shear volume added by the owner', () => {
    const { joiner, tracker, owner } = volumePair();
    const shear = modifierVolumeTemplateCreate('shear');
    owner.world.add(shear);
    joiner.remoteApply(JSON.parse(JSON.stringify(tracker.commit().ops)));
    expect(ModifierVolume.read(replicaObject(joiner, shear.uuid))).toEqual(ModifierVolume.read(shear));
  });
});
