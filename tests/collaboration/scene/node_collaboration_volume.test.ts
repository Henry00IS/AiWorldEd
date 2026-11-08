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
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackParameterSet } from '@/modifier/stack/modifier_stack_operations.js';
import type { ModifierStackValue } from '@/modifier/stack/modifier_stack_types.js';
import { curveEncode } from '@/curve/model/curve_codec.js';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { CURVE_PRESETS_TURNERY } from '@/curve/model/curve_preset_turnery.js';
import { CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';

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
  return { owner, joiner, tracker, volume, model };
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

  it('syncs a Smooth Shading volume and its max angle', () => {
    const { joiner, tracker, owner } = volumePair();
    const smooth = modifierVolumeTemplateCreate('smooth');
    owner.world.add(smooth);
    joiner.remoteApply(JSON.parse(JSON.stringify(tracker.commit().ops)));
    const stack = ModifierVolume.read(smooth);
    ModifierVolume.write(smooth, modifierStackParameterSet(stack, stack.modifiers[0]?.id ?? '', 'maxAngle', 45));
    joiner.remoteApply(JSON.parse(JSON.stringify(tracker.commit().ops)));
    expect(ModifierVolume.read(replicaObject(joiner, smooth.uuid)).modifiers[0]).toMatchObject({
      kind: 'smooth',
      parameters: { maxAngle: 45 },
    });
  });

  it('syncs a shear volume added by the owner', () => {
    const { joiner, tracker, owner } = volumePair();
    const shear = modifierVolumeTemplateCreate('shear');
    owner.world.add(shear);
    joiner.remoteApply(JSON.parse(JSON.stringify(tracker.commit().ops)));
    expect(ModifierVolume.read(replicaObject(joiner, shear.uuid))).toEqual(ModifierVolume.read(shear));
  });

  it('syncs a generator node inside a model with its parent, role and pose', () => {
    const { joiner, tracker, model } = volumePair();
    const stairs = modifierGeneratorNodeCreate('stairs');
    model.root.add(stairs);
    joiner.remoteApply(JSON.parse(JSON.stringify(tracker.commit().ops)));
    const remote = replicaObject(joiner, stairs.uuid);
    expect(remote.parent?.uuid).toBe(replicaObject(joiner, model.root.uuid).uuid);
    expect(ModifierVolume.isGenerator(remote)).toBe(true);
    expect(ModifierVolume.read(remote)).toEqual(ModifierVolume.read(stairs));
    stairs.position.set(0.25, 0, -0.5);
    joiner.remoteApply(JSON.parse(JSON.stringify(tracker.commit().ops)));
    expect(replicaObject(joiner, stairs.uuid).position.toArray()).toEqual([0.25, 0, -0.5]);
  });

  it.each(['baluster', 'softened_table_leg'])(
    'syncs the %s column profile including section fractions and aspect',
    (presetId) => {
      const { joiner, tracker, model } = volumePair();
      const column = modifierGeneratorNodeCreate('column');
      model.root.add(column);
      joiner.remoteApply(JSON.parse(JSON.stringify(tracker.commit().ops)));
      let stack = ModifierVolume.read(column);
      const step = stack.modifiers[0]?.id ?? '';
      const preset = [...CURVE_PRESETS_ARCHITECTURE, ...CURVE_PRESETS_TURNERY].find((entry) => entry.id === presetId);
      if (!preset) throw new Error('Expected the baluster preset');
      const profile = curveEncode(curvePresetBuild(preset));
      stack = modifierStackParameterSet(stack, step, 'profile', profile);
      stack = modifierStackParameterSet(stack, step, 'aspect', 1.5);
      ModifierVolume.write(column, stack);
      joiner.remoteApply(JSON.parse(JSON.stringify(tracker.commit().ops)));
      const parameters = ModifierVolume.read(replicaObject(joiner, column.uuid)).modifiers[0]?.parameters;
      expect(parameters?.['profile']).toBe(profile);
      expect(parameters?.['aspect']).toBe(1.5);
    },
  );

  it('rebuilds on the joiner when the owner hides or shows a volume', () => {
    const { joiner, tracker, volume } = volumePair();
    const remote = replicaObject(joiner, volume.uuid);
    expect(derivedCount(remote)).toBe(2);
    volume.visible = false;
    joiner.remoteApply(JSON.parse(JSON.stringify(tracker.commit().ops)));
    expect(remote.visible).toBe(false);
    expect(derivedCount(remote)).toBe(0);
    volume.visible = true;
    joiner.remoteApply(JSON.parse(JSON.stringify(tracker.commit().ops)));
    expect(derivedCount(remote)).toBe(2);
  });
});
