import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { physicsShatterLastRunOf } from '@/modifier/stack/kinds/shatter/physics_shatter_last_run.js';
import { physicsShatterLevelWorldBuild } from '@/modifier/stack/kinds/shatter/sim/physics_shatter_sim_level.js';
import { physicsLevelSolidColliderKey } from '@/physics/level/physics_level_solid_tracker.js';
import { PhysicsRapierRuntime } from '@/physics/rapier/physics_rapier_runtime.js';
import type { ModifierStackActionTarget } from '@/modifier/stack/modifier_stack_types.js';
import { physicsShatterSimulateAction } from '@/modifier/stack/kinds/shatter/sim/physics_shatter_simulate.js';
import { physicsShatterBakeDecode } from '@/modifier/stack/kinds/shatter/sim/physics_shatter_bake.js';
import { stackFixtureEntries } from '../../../modifier_stack_fixture.js';

/**
 * Builds a floor slab with a wall standing on its edge and a Physics Shatter
 * volume around the wall only, then compiles and rebuilds the result.
 *
 * @returns Scene parts.
 */
function edgeScene() {
  const world = new THREE.Group();
  const model = new SolidModel('edge');
  world.add(model.root);
  const box = (min: number[], max: number[]) => {
    const brush = model.addBoxBrush(1, SolidOperation.Additive, null, false);
    brush.mesh?.position.set((min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2);
    brush.mesh?.scale.set(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!);
    return brush;
  };
  const floor = box([-2, -0.5, -2], [2, 0, 2]);
  box([1.7, 0, -1], [2, 2, 1]);
  const volume = ModifierVolume.create({
    modifiers: stackFixtureEntries([
      {
        kind: 'physicsShatter',
        parameters: {
          crackSize: 0.35,
          strength: 6,
          radius: 2.5,
          impactX: -0.4,
          directionX: 1,
          directionY: 0,
          directionZ: 0,
          duration: 3,
        },
      },
    ]),
  });
  volume.position.set(1.85, 1.15, 0);
  volume.scale.set(0.6, 2.2, 2.4);
  world.add(volume);
  world.updateMatrixWorld(true);
  model.syncBrushOrderFromScene();
  modifierStackCompile(model.getBrushes(), model.root);
  model.rebuild(true);
  return { world, model, volume, floor };
}

describe('physicsShatterLevelWorldBuild', () => {
  it('keeps the real floor and leaves out the volume inputs, its pieces and any artificial bound', async () => {
    const scene = edgeScene();
    const step = ModifierVolume.read(scene.volume).modifiers[0]!;
    const run = physicsShatterLastRunOf(scene.volume.uuid, step.id)!;
    expect(run.fracture.pieces.length).toBeGreaterThan(1);
    const rapier = await PhysicsRapierRuntime.ensureLoaded();
    const owner = { volumeUuid: scene.volume.uuid, stepId: step.id, inputBrushIds: run.inputBrushIds };
    const level = physicsShatterLevelWorldBuild(rapier, scene.world, owner);
    const floorKey = physicsLevelSolidColliderKey(scene.model.getResultMesh(), scene.floor.id);
    expect(level.listColliderKeys()).toEqual([floorKey]);
    const below = level.castRay(new THREE.Vector3(3, 1, 0), new THREE.Vector3(0, -1, 0), 1000);
    expect(below).toBeNull();
    const onFloor = level.castRay(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), 1000);
    expect(onFloor?.distance).toBeCloseTo(1, 3);
    level.getRapierWorld().free();
  });

  it('lets pieces blasted off the floor edge fall into the void and repeats the same bake on a second Simulate', async () => {
    const scene = edgeScene();
    const step = ModifierVolume.read(scene.volume).modifiers[0]!;
    const target: ModifierStackActionTarget = {
      volume: scene.volume,
      stepId: step.id,
      commandStack: null,
      status: () => {},
    };
    const bake = async () => {
      await physicsShatterSimulateAction(target);
      return String(ModifierVolume.read(scene.volume).modifiers[0]?.parameters['bake'] ?? '');
    };
    const first = await bake();
    scene.world.updateMatrixWorld(true);
    modifierStackCompile(scene.model.getBrushes(), scene.model.root);
    scene.model.rebuild(true);
    expect(await bake()).toBe(first);
    const run = physicsShatterLastRunOf(scene.volume.uuid, step.id)!;
    const transforms = physicsShatterBakeDecode(first, run.fracture.pieces.length) ?? [];
    const ends = run.fracture.pieces.map((piece, index) =>
      piece.centroid.clone().add(transforms[index]!.translation).applyMatrix4(run.frameToWorld),
    );
    expect(ends.every((end) => Number.isFinite(end.y) && end.y < -5)).toBe(true);
  }, 60000);
});
