import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { physicsShatterFracture } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_fracture.js';
import { physicsShatterInputHash } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_hash.js';
import { physicsShatterBrushVolume } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_geometry.js';
import { physicsShatterPieceShape } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_quality.js';
import type {
  PhysicsShatterInput,
  PhysicsShatterPiece,
  PhysicsShatterResult,
} from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_types.js';
import { physicsShatterTestSettings } from '../physics_shatter_fixtures.js';

/** Fracture settings with Shatter off. */
const INTACT_SETTINGS = physicsShatterTestSettings({ shatter: false });

/**
 * Builds a box input between two corners.
 *
 * @param id Brush id.
 * @param min Lower corner.
 * @param max Upper corner.
 * @param operation CSG operation.
 * @returns Fracture input.
 */
function intactBox(
  id: string,
  min: THREE.Vector3Tuple,
  max: THREE.Vector3Tuple,
  operation = SolidOperation.Additive,
): PhysicsShatterInput {
  const brush = SolidBrushFactory.createBox(new THREE.Vector3(...min), new THREE.Vector3(...max));
  return { sourceBrushId: id, brush, operation };
}

/**
 * Returns whether a point lies strictly inside a convex solid.
 *
 * @param brush Convex brush.
 * @param point Point.
 * @returns True when inside every plane by more than a micrometre.
 */
function intactInside(brush: SolidBrush, point: THREE.Vector3): boolean {
  return brush.planes.every((plane) => plane.signedDistance(point) < -1e-6);
}

/**
 * Samples a box on a grid and checks that a point is covered by exactly one
 * piece where the expected solid is, and by none elsewhere.
 *
 * @param pieces Pieces to test.
 * @param bounds Sampled box.
 * @param solid Whether a point belongs to the expected solid.
 * @returns Number of sample points that broke the rule.
 */
function intactCoverageErrors(
  pieces: readonly PhysicsShatterPiece[],
  bounds: THREE.Box3,
  solid: (point: THREE.Vector3) => boolean,
): number {
  const steps = 23;
  const size = bounds.getSize(new THREE.Vector3());
  const point = new THREE.Vector3();
  let errors = 0;
  for (let index = 0; index < steps ** 3; index++) {
    point.set((index % steps) + 0.5, (Math.floor(index / steps) % steps) + 0.5, Math.floor(index / steps ** 2) + 0.5);
    point.multiply(size).divideScalar(steps).add(bounds.min);
    const covering = pieces.filter((piece) => intactInside(piece.brush, point)).length;
    if (covering !== (solid(point) ? 1 : 0)) errors++;
  }
  return errors;
}

/**
 * Returns the volume two convex solides share, by clipping one with the other's
 * planes.
 *
 * @param first First brush.
 * @param second Second brush.
 * @returns Shared volume.
 */
function intactSharedVolume(first: PhysicsShatterInput, second: PhysicsShatterInput): number {
  const firstBox = new THREE.Box3().setFromPoints(first.brush.vertices);
  const other = new THREE.Box3().setFromPoints(second.brush.vertices);
  const shared = firstBox.intersect(other);
  if (shared.isEmpty()) return 0;
  const size = shared.getSize(new THREE.Vector3());
  return size.x * size.y * size.z;
}

/**
 * Lists every vertex coordinate of every piece, for determinism checks.
 *
 * @param result Fracture result.
 * @returns Keys, body ids and coordinates.
 */
function intactFingerprint(result: PhysicsShatterResult): unknown[] {
  return result.pieces.map((piece) => [
    piece.key,
    piece.bodyId,
    piece.faces,
    piece.brush.vertices.map((v) => v.toArray()),
  ]);
}

/**
 * Builds a 4 m wide, 3 m tall, 25 cm thick wall with a window cut by a later
 * subtractive brush, and a shelf after it.
 *
 * @returns Inputs and the window bounds.
 */
function intactWallWithWindow(): { inputs: PhysicsShatterInput[]; wall: THREE.Box3; window: THREE.Box3 } {
  const wall = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 3, 0.25));
  const window = new THREE.Box3(new THREE.Vector3(1.2, 1, -0.1), new THREE.Vector3(2.6, 2.2, 0.35));
  const inputs = [
    intactBox('wall', wall.min.toArray(), wall.max.toArray()),
    intactBox('window', window.min.toArray(), window.max.toArray(), SolidOperation.Subtractive),
  ];
  return { inputs, wall, window };
}

describe('physics shatter with Shatter off', () => {
  it('makes one piece per plain additive input, bit for bit the input brush with its own faces', () => {
    const inputs = [
      intactBox('floor', [0, 0, 0], [3, 0.2, 3]),
      intactBox('crate', [0.5, 0.2, 0.5], [1.5, 1.2, 1.5]),
      intactBox('top', [0.6, 1.2, 0.6], [1.4, 1.6, 1.4]),
      intactBox('post', [2, 0.2, 2], [2.3, 2.2, 2.3]),
    ];
    const result = physicsShatterFracture(inputs, INTACT_SETTINGS);
    expect(result.pieces.length).toBe(inputs.length);
    result.pieces.forEach((piece, index) => {
      const input = inputs[index];
      expect(piece.sourceIndex).toBe(index);
      expect(piece.brush).toBe(input?.brush);
      expect(piece.brush.planes.map((plane) => [plane.normal.toArray(), plane.offset])).toEqual(
        input?.brush.planes.map((plane) => [plane.normal.toArray(), plane.offset]),
      );
      expect(piece.faces.map((face) => face.kind)).toEqual(input?.brush.faces.map(() => 'original'));
      expect(piece.faces.map((face) => face.sourceFaceIndex)).toEqual(input?.brush.faces.map((_f, i) => i));
      expect(piece.bodyId).toBeUndefined();
      expect(piece.seed).toBe(INTACT_SETTINGS.seed);
    });
    expect(result.droppedPieces + result.carvedVolume + result.unsoundPieces).toBe(0);
  });

  it('splits a brush a later subtractive brush carves into convex parts of one body that fill the CSG result', () => {
    const { inputs, wall, window } = intactWallWithWindow();
    const result = physicsShatterFracture(inputs, INTACT_SETTINGS);
    expect(result.pieces.length).toBeGreaterThan(1);
    expect(new Set(result.pieces.map((piece) => piece.bodyId))).toEqual(new Set([0]));
    for (const piece of result.pieces) expect(SolidBrushValidator.validateGenerated(piece.brush).valid).toBe(true);
    const expected = physicsShatterBrushVolume(inputs[0]!.brush) - intactSharedVolume(inputs[0]!, inputs[1]!);
    const kept = result.pieces.reduce((sum, piece) => sum + piece.volume, 0);
    expect(kept).toBeCloseTo(expected, 9);
    const solid = (point: THREE.Vector3) => wall.containsPoint(point) && !window.containsPoint(point);
    const sampled = wall.clone().expandByScalar(0.1);
    expect(intactCoverageErrors(result.pieces, sampled, solid)).toBe(0);
    const holeWalls = result.pieces.flatMap((piece) => piece.faces).filter((face) => face.sourceInputIndex === 1);
    expect(holeWalls.length).toBeGreaterThanOrEqual(4);
    expect(result.droppedPieces + result.unsoundPieces).toBe(0);
  });

  it('uses no more parts than a frame needs: four around a window', () => {
    const { inputs } = intactWallWithWindow();
    expect(physicsShatterFracture(inputs, INTACT_SETTINGS).pieces.length).toBe(4);
  });

  it('splits soundly around a turned cut and a second overlapping hole, sharing one body', () => {
    const wall = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 3, 0.3));
    const turned = intactBox('turned', [-0.5, -0.5, -0.2], [0.5, 0.5, 0.5], SolidOperation.Subtractive);
    turned.brush.transformVertices(new THREE.Matrix4().makeRotationZ(0.5).setPosition(1.3, 1.4, 0));
    const second = intactBox('second', [1.6, 0.8, -0.2], [2.9, 2.0, 0.5], SolidOperation.Subtractive);
    const inputs = [intactBox('wall', wall.min.toArray(), wall.max.toArray()), turned, second];
    const result = physicsShatterFracture(inputs, INTACT_SETTINGS);
    expect(result.pieces.length).toBeGreaterThan(2);
    expect(new Set(result.pieces.map((piece) => piece.bodyId))).toEqual(new Set([0]));
    for (const piece of result.pieces) expect(SolidBrushValidator.validateGenerated(piece.brush).valid).toBe(true);
    const solid = (point: THREE.Vector3) =>
      wall.containsPoint(point) && !intactInside(turned.brush, point) && !intactInside(second.brush, point);
    expect(intactCoverageErrors(result.pieces, wall.clone().expandByScalar(0.05), solid)).toBe(0);
    expect(result.droppedPieces + result.unsoundPieces).toBe(0);
  });

  it('gives the shared volume of overlapping brushes to the later one, which stays whole', () => {
    const inputs = [intactBox('a', [0, 0, 0], [2, 1, 1]), intactBox('b', [1.5, 0.5, 0], [3, 2, 1])];
    const result = physicsShatterFracture(inputs, INTACT_SETTINGS);
    const first = result.pieces.filter((piece) => piece.sourceIndex === 0);
    const second = result.pieces.filter((piece) => piece.sourceIndex === 1);
    expect(second.length).toBe(1);
    expect(second[0]?.brush).toBe(inputs[1]?.brush);
    expect(second[0]?.bodyId).toBeUndefined();
    expect(first.length).toBe(2);
    expect(first.every((piece) => piece.bodyId === 0)).toBe(true);
    const expected = 2 - intactSharedVolume(inputs[0]!, inputs[1]!);
    expect(first.reduce((sum, piece) => sum + piece.volume, 0)).toBeCloseTo(expected, 9);
    const joins = first.flatMap((piece) => piece.faces).filter((face) => face.sourceInputIndex === 1);
    expect(joins.length).toBeGreaterThan(0);
  });

  it('keeps a thin strip a hole leaves as a part instead of dropping it, at its full thickness', () => {
    const inputs = [
      intactBox('wall', [0, 0, 0], [2, 2, 0.2]),
      intactBox('cut', [0.5, 0.01, -0.1], [1.5, 1.5, 0.3], SolidOperation.Subtractive),
    ];
    const result = physicsShatterFracture(inputs, INTACT_SETTINGS);
    const kept = result.pieces.reduce((sum, piece) => sum + piece.volume, 0);
    expect(kept).toBeCloseTo(0.8 - 1 * 1.49 * 0.2, 9);
    expect(result.droppedPieces).toBe(0);
    const thinnest = Math.min(...result.pieces.map((piece) => physicsShatterPieceShape(piece.brush).thickness));
    expect(thinnest).toBeGreaterThan(0.009);
  });

  it('removes a brush a later brush swallows whole and leaves subtractive and intersecting inputs out', () => {
    const inputs = [
      intactBox('inner', [0.2, 0.2, 0.2], [0.8, 0.8, 0.8]),
      intactBox('outer', [0, 0, 0], [1, 1, 1]),
      intactBox('cut', [3, 0, 0], [4, 1, 1], SolidOperation.Subtractive),
      intactBox('clip', [5, 0, 0], [6, 1, 1], SolidOperation.Intersecting),
    ];
    const result = physicsShatterFracture(inputs, INTACT_SETTINGS);
    expect(result.pieces.map((piece) => piece.sourceBrushId)).toEqual(['outer']);
    expect(result.carvedVolume).toBeCloseTo(0.216, 9);
    expect(result.carvingInputs).toBe(2);
  });

  it('is deterministic and hashes the switch, so flipping it turns a bake stale', () => {
    const { inputs } = intactWallWithWindow();
    const first = physicsShatterFracture(inputs, INTACT_SETTINGS);
    const again = physicsShatterFracture(intactWallWithWindow().inputs, INTACT_SETTINGS);
    expect(intactFingerprint(again)).toEqual(intactFingerprint(first));
    const on = physicsShatterInputHash(inputs, physicsShatterTestSettings());
    expect(physicsShatterInputHash(inputs, INTACT_SETTINGS)).not.toBe(on);
    expect(physicsShatterInputHash(inputs, physicsShatterTestSettings({ shatter: false }))).toBe(
      physicsShatterInputHash(inputs, INTACT_SETTINGS),
    );
  });

  it('never sets a body id while shattering', () => {
    const { inputs } = intactWallWithWindow();
    const result = physicsShatterFracture(inputs, physicsShatterTestSettings({ crackSize: 0.6 }));
    expect(result.pieces.length).toBeGreaterThan(4);
    expect(result.pieces.every((piece) => piece.bodyId === undefined)).toBe(true);
  });
});
