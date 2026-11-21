import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierGeneratorOperationCommand } from '@/modifier/stack/modifier_generator_operation.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackEntryCreate } from '@/modifier/stack/modifier_stack_settings.js';
import { physicsShatterLastRunOf } from '@/modifier/stack/kinds/shatter/physics_shatter_last_run.js';
import { physicsShatterFracture } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_fracture.js';
import { PHYSICS_SHATTER_MATERIALS } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_materials.js';
import { PhysicsShatterRandom } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_random.js';
import { solidCsgCoverageCheck, type SolidCsgCoverageBrush } from '../../../../solid/solid_csg_coverage_oracle.js';
import {
  physicsShatterTestInputs,
  physicsShatterTestSettings,
  physicsShatterTestWall,
} from './fracture/physics_shatter_fixtures.js';

/** Largest tilt of a settled piece in the jiggle, in radians. */
const WATERTIGHT_JIGGLE_TILT = 0.004;

/** Largest move of a settled piece in the jiggle, in metres. */
const WATERTIGHT_JIGGLE_MOVE = 0.0015;

/** Smallest area any piece face may have, in square metres. */
const WATERTIGHT_MIN_FACE_AREA = 1e-6;

/**
 * Returns the area of a convex polygon.
 *
 * @param loop Ordered polygon.
 * @returns Area.
 */
function polygonArea(loop: readonly THREE.Vector3[]): number {
  const sum = new THREE.Vector3();
  for (let index = 1; index + 1 < loop.length; index++) {
    const edgeA = loop[index]!.clone().sub(loop[0]!);
    sum.add(edgeA.cross(loop[index + 1]!.clone().sub(loop[0]!)));
  }
  return sum.length() / 2;
}

/**
 * Expects a piece to be a closed convex solid whose every plane has a sound
 * polygon.
 *
 * @param brush Piece brush.
 */
function expectClosedConvex(brush: SolidBrush): void {
  expect(SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
  expect(brush.planes.length).toBe(brush.faces.length);
  for (const face of brush.faces)
    expect(polygonArea(brush.getFaceVertices(face))).toBeGreaterThan(WATERTIGHT_MIN_FACE_AREA);
  for (const plane of brush.planes)
    for (const vertex of brush.vertices) expect(plane.signedDistance(vertex)).toBeLessThan(1e-6);
}

/**
 * Moves and tilts every piece a little about its own centre, the way pieces
 * settle against each other after a simulation, the same way for a seed.
 *
 * @param brushes Pieces.
 * @param seed Jiggle seed.
 * @returns Moved copies.
 */
function settleJiggle(brushes: readonly SolidBrush[], seed: number): SolidBrush[] {
  const random = new PhysicsShatterRandom(seed, 0);
  const signed = () => random.between(-1, 1);
  return brushes.map((brush) => {
    const centre = brush.computeLocalBounds().getCenter(new THREE.Vector3());
    const move = new THREE.Vector3(signed(), signed(), signed()).multiplyScalar(WATERTIGHT_JIGGLE_MOVE);
    const tilt = new THREE.Euler(signed(), signed(), signed());
    tilt.set(tilt.x * WATERTIGHT_JIGGLE_TILT, tilt.y * WATERTIGHT_JIGGLE_TILT, tilt.z * WATERTIGHT_JIGGLE_TILT);
    const rotation = new THREE.Matrix4().makeRotationFromEuler(tilt);
    const toOrigin = new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z);
    const back = new THREE.Matrix4().makeTranslation(centre.x + move.x, centre.y + move.y, centre.z + move.z);
    const moved = brush.clone();
    moved.transformVertices(back.multiply(rotation).multiply(toOrigin));
    return moved;
  });
}

/**
 * Compiles the union of pieces and returns its coverage report.
 *
 * @param brushes Pieces in model space.
 * @returns Coverage report.
 */
function unionCoverage(brushes: readonly SolidBrush[]) {
  const named: SolidCsgCoverageBrush[] = brushes.map((brush, index) => ({
    id: `piece-${index}`,
    name: `piece-${index}`,
    brush,
  }));
  const instances = named.map(
    ({ id, name, brush }) => new SolidBrushInstance(id, name, brush, SolidOperation.Additive),
  );
  return solidCsgCoverageCheck(named, new SolidCsgCompiler().compile(instances, { forceFull: true }));
}

/**
 * Expects pieces to be closed convex solides and their union to keep every
 * visible face, both as fractured and after settling.
 *
 * @param brushes Pieces.
 * @param seed Settle seed.
 */
function expectWatertight(brushes: readonly SolidBrush[], seed: number): void {
  expect(brushes.length).toBeGreaterThan(1);
  for (const brush of brushes) expectClosedConvex(brush);
  for (const placed of [brushes, settleJiggle(brushes, seed)]) {
    const report = unionCoverage(placed);
    expect(report.missingFaces).toEqual([]);
    expect(report.extraPolygons).toBe(0);
  }
}

/**
 * Builds a 4 x 3 m wall with a Blast Hole through it, filled back and
 * shattered, and returns the shatter pieces.
 *
 * @param style Blast Hole style.
 * @param seed Blast Hole seed.
 * @returns Piece brushes.
 */
function blastHolePieces(style: 'Jagged' | 'Bricks', seed: number): SolidBrush[] {
  const model = new SolidModel('Watertight blast hole');
  const wall = model.addBoxBrush(1, SolidOperation.Additive, null, false);
  wall.mesh?.scale.set(4, 3, 0.3);
  const node = modifierGeneratorNodeCreate('blastHole');
  node.scale.z = 0.3;
  model.root.add(node);
  modifierGeneratorOperationCommand(node, SolidOperation.Subtractive)?.execute();
  const settings = ModifierVolume.read(node);
  const [hole, ...rest] = settings.modifiers;
  const shatter = modifierStackEntryCreate('physicsShatter', settings.modifiers);
  shatter.parameters = { ...shatter.parameters, material: style === 'Bricks' ? 'brick' : 'concrete', seed };
  const holeParameters = { ...hole!.parameters, style, seed, fillBack: true };
  ModifierVolume.write(node, { ...settings, modifiers: [{ ...hole!, parameters: holeParameters }, ...rest, shatter] });
  model.root.updateMatrixWorld(true);
  modifierStackCompile(model.getBrushes(), model.root);
  return (physicsShatterLastRunOf(node.uuid, shatter.id)?.fracture.pieces ?? []).map((piece) => piece.brush);
}

describe('physics shatter pieces stay watertight through CSG', () => {
  it.each(PHYSICS_SHATTER_MATERIALS.flatMap((material) => [1, 2, 3].map((seed) => [material, seed] as const)))(
    '%s seed %s: closed convex pieces, no missing or buried faces before and after settling',
    (material, seed) => {
      const settings = physicsShatterTestSettings({ material, seed, crackSize: 0.4, maxPieces: 120 });
      const result = physicsShatterFracture(physicsShatterTestInputs(physicsShatterTestWall(1.6, 1.2, 0.2)), settings);
      expectWatertight(
        result.pieces.map((piece) => piece.brush),
        seed,
      );
    },
  );

  it.each([
    ['Jagged', 3],
    ['Jagged', 7],
    ['Jagged', 11],
    ['Bricks', 3],
    ['Bricks', 7],
    ['Bricks', 11],
  ] as const)('Blast Hole %s seed %s: fill pieces closed, no missing or buried faces', (style, seed) => {
    expectWatertight(blastHolePieces(style, seed), seed);
  });
});
