import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { physicsShatterLastRunOf } from '@/modifier/stack/kinds/shatter/physics_shatter_last_run.js';
import { physicsShatterTransformMatrix } from '@/modifier/stack/kinds/shatter/physics_shatter_transform.js';
import type { PhysicsShatterPiece } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_types.js';
import { physicsShatterSimulateAction } from '@/modifier/stack/kinds/shatter/sim/physics_shatter_simulate.js';
import { physicsShatterBakeDecode } from '@/modifier/stack/kinds/shatter/sim/physics_shatter_bake.js';
import { physicsShatterBodyGroups } from '@/modifier/stack/kinds/shatter/sim/physics_shatter_sim_bodies.js';
import { stackFixtureEntries } from '../../../modifier_stack_fixture.js';

/** World height of the volume's frame origin. */
const VOLUME_HEIGHT = 1.35;

/**
 * A wall with a window on a floor, and a Physics Shatter volume around the wall
 * with Shatter off.
 */
interface CompoundScene {
  world: THREE.Group;
  model: SolidModel;
  volume: THREE.Object3D;
}

/**
 * Adds a box brush spanning two corners.
 *
 * @param model Solid.
 * @param min Lower corner.
 * @param max Upper corner.
 * @param operation CSG operation.
 */
function compoundBox(
  model: SolidModel,
  min: THREE.Vector3Tuple,
  max: THREE.Vector3Tuple,
  operation: SolidOperation,
): void {
  const brush = model.addBoxBrush(1, operation, null, false);
  brush.mesh?.position
    .set(...min)
    .add(new THREE.Vector3(...max))
    .multiplyScalar(0.5);
  brush.mesh?.scale.set(...max).sub(new THREE.Vector3(...min));
}

/**
 * Builds the scene with a blast from the front that tips the wall over.
 *
 * @returns Scene.
 */
function compoundScene(): CompoundScene {
  const world = new THREE.Group();
  const model = new SolidModel('compound');
  world.add(model.root);
  compoundBox(model, [-4, -0.5, -4], [4, 0, 4], SolidOperation.Additive);
  compoundBox(model, [-1.5, 0, -0.15], [1.5, 2.5, 0.15], SolidOperation.Additive);
  compoundBox(model, [-0.5, 0.8, -0.3], [0.5, 1.6, 0.3], SolidOperation.Subtractive);
  const parameters = {
    shatter: false,
    strength: 6,
    radius: 3,
    impactY: 0.8,
    impactZ: 0.8,
    directionZ: -1,
    duration: 3,
  };
  const volume = ModifierVolume.create({ modifiers: stackFixtureEntries([{ kind: 'physicsShatter', parameters }]) });
  volume.position.set(0, VOLUME_HEIGHT, 0);
  volume.scale.set(3.2, 2.6, 0.5);
  world.add(volume);
  world.updateMatrixWorld(true);
  model.syncBrushOrderFromScene();
  modifierStackCompile(model.getBrushes(), model.root);
  return { world, model, volume };
}

/**
 * Returns the largest gap a frame point opens between two pieces' baked poses.
 *
 * @param pieces Pieces of one body.
 * @param poses Baked matrix per piece, by piece index.
 * @returns Largest distance in metres.
 */
function compoundLargestGap(pieces: readonly PhysicsShatterPiece[], poses: readonly THREE.Matrix4[]): number {
  let largest = 0;
  const first = poses[pieces[0]?.index ?? 0] ?? new THREE.Matrix4();
  for (const piece of pieces) {
    for (let offset = 0; offset + 2 < piece.hull.length; offset += 3) {
      const point = new THREE.Vector3().fromArray(piece.hull, offset);
      const own = point.clone().applyMatrix4(poses[piece.index] ?? new THREE.Matrix4());
      largest = Math.max(largest, own.distanceTo(point.applyMatrix4(first)));
    }
  }
  return largest;
}

/**
 * Returns the lowest frame height any baked hull point of the pieces reaches.
 *
 * @param pieces Pieces.
 * @param poses Baked matrix per piece, by piece index.
 * @returns Lowest height in the frame.
 */
function compoundLowest(pieces: readonly PhysicsShatterPiece[], poses: readonly THREE.Matrix4[]): number {
  let lowest = Infinity;
  for (const piece of pieces) {
    for (let offset = 0; offset + 2 < piece.hull.length; offset += 3) {
      const point = new THREE.Vector3()
        .fromArray(piece.hull, offset)
        .applyMatrix4(poses[piece.index] ?? new THREE.Matrix4());
      lowest = Math.min(lowest, point.y);
    }
  }
  return lowest;
}

describe('physics shatter compound bodies', { timeout: 60_000 }, () => {
  it('groups pieces that share a body id and keeps every other piece on its own, in order', () => {
    const piece = (index: number, bodyId?: number) => ({ index, bodyId }) as PhysicsShatterPiece;
    const groups = physicsShatterBodyGroups([piece(0), piece(1, 4), piece(2), piece(3, 4), piece(4, 9)]);
    expect(groups.map((group) => group.map(({ index }) => index))).toEqual([[0], [1, 3], [2], [4]]);
  });

  it('tips a carved wall over onto the floor as one body whose parts keep their places within 0.1 mm', async () => {
    const { volume } = compoundScene();
    const stepId = ModifierVolume.read(volume).modifiers[0]?.id ?? '';
    const run = physicsShatterLastRunOf(volume.uuid, stepId);
    const parts = run?.fracture.pieces.filter((piece) => piece.bodyId !== undefined) ?? [];
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(new Set(parts.map(({ bodyId }) => bodyId)).size).toBe(1);
    await physicsShatterSimulateAction({ volume, stepId, commandStack: null, status: () => undefined });
    const bake = String(ModifierVolume.read(volume).modifiers[0]?.parameters['bake'] ?? '');
    const transforms = physicsShatterBakeDecode(bake, run?.fracture.pieces.length ?? 0) ?? [];
    const poses = (run?.fracture.pieces ?? []).map((piece, index) =>
      transforms[index] ? physicsShatterTransformMatrix(transforms[index], piece.centroid) : new THREE.Matrix4(),
    );
    expect(run?.fracture.pieces.length).toBe(parts.length);
    const turned = transforms[parts[0]?.index ?? 0]?.rotation.angleTo(new THREE.Quaternion()) ?? 0;
    expect(turned).toBeGreaterThan(Math.PI / 4);
    expect(compoundLowest(parts, poses) + VOLUME_HEIGHT).toBeGreaterThan(-0.05);
    expect(compoundLargestGap(parts, poses)).toBeLessThan(1e-4);
  });
});
