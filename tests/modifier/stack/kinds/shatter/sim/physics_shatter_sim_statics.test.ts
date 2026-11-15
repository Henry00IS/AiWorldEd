import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { physicsShatterLastRunOf } from '@/modifier/stack/kinds/shatter/physics_shatter_last_run.js';
import { physicsShatterStaticsGather } from '@/modifier/stack/kinds/shatter/sim/physics_shatter_sim_statics.js';
import { stackFixtureEntries } from '../../../modifier_stack_fixture.js';

/**
 * Builds a solid with a box fully covered by a later box inside a shatter
 * volume, and one box outside it, then evaluates the volume.
 *
 * @returns World and the last run of the volume's shatter step.
 */
function staticsTestScene() {
  const world = new THREE.Group();
  const model = new SolidModel('statics');
  world.add(model.root);
  const group = new THREE.Group();
  markAsSolidCsgGroup(group, SolidOperation.Additive);
  model.root.add(group);
  model.addBoxBrush(0.5, SolidOperation.Additive, group);
  model.addBoxBrush(1, SolidOperation.Additive, group);
  model.addBoxBrush(1, SolidOperation.Additive).mesh?.position.set(9, 0, 0);
  const volume = ModifierVolume.create({
    modifiers: stackFixtureEntries([{ kind: 'physicsShatter', parameters: { crackSize: 0.5 } }]),
  });
  volume.scale.setScalar(4);
  world.add(volume);
  world.updateMatrixWorld(true);
  model.syncBrushOrderFromScene();
  modifierStackCompile(model.getBrushes(), model.root);
  const stepId = ModifierVolume.read(volume).modifiers[0]?.id ?? '';
  return { world, run: physicsShatterLastRunOf(volume.uuid, stepId) };
}

describe('physics shatter fixed colliders', () => {
  it('leaves out an input brush that made no pieces, so a covered brush is no invisible collider', () => {
    const { world, run } = staticsTestScene();
    if (!run) throw new Error('No last run.');
    const pieces = run.fracture.pieces;
    expect(physicsShatterStaticsGather(world, pieces, run.frameToWorld).hulls).toHaveLength(2);
    const statics = physicsShatterStaticsGather(world, pieces, run.frameToWorld, run.inputBrushIds);
    expect(statics.hulls).toHaveLength(1);
    expect(new THREE.Box3().setFromArray(statics.hulls[0] ?? []).getCenter(new THREE.Vector3()).x).toBeCloseTo(9);
  });
});
