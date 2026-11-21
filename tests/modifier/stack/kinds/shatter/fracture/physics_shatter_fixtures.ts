import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { expect } from 'vitest';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import type {
  PhysicsShatterInput,
  PhysicsShatterResult,
  PhysicsShatterSettings,
} from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_types.js';
import {
  PHYSICS_SHATTER_MAX_BULGE,
  PHYSICS_SHATTER_MIN_EDGE,
  physicsShatterMinThicknessForSize,
  physicsShatterPieceShape,
} from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_quality.js';

/**
 * Returns fracture settings for tests, with overrides.
 *
 * @param overrides Settings to change.
 * @returns Complete settings.
 */
export function physicsShatterTestSettings(overrides: Partial<PhysicsShatterSettings> = {}): PhysicsShatterSettings {
  return {
    shatter: true,
    material: 'custom',
    mode: 'glass',
    cracks: 'auto',
    thicknessAxis: 'auto',
    grainAxis: 'auto',
    grainStretch: 1,
    radialSpokes: 10,
    seed: 7,
    crackSize: 0.5,
    impactDetail: 0,
    impactPoint: new THREE.Vector3(),
    impactRadius: 1,
    brickLength: 0.4,
    brickHeight: 0.2,
    mortarGap: 0,
    brickJitter: 0,
    maxPieces: 500,
    ...overrides,
  };
}

/**
 * Builds a wall box of the given size whose bottom centre is at the origin.
 *
 * @param width Size along X.
 * @param height Size along Y.
 * @param depth Size along Z.
 * @returns Box brush.
 */
export function physicsShatterTestWall(width: number, height: number, depth: number): SolidBrush {
  return SolidBrushFactory.createBox(
    new THREE.Vector3(-width / 2, 0, -depth / 2),
    new THREE.Vector3(width / 2, height, depth / 2),
  );
}

/**
 * Wraps brushes as fracture inputs with ids brush-0, brush-1, ...
 *
 * @param brushes Convex brushes.
 * @returns Inputs.
 */
export function physicsShatterTestInputs(...brushes: SolidBrush[]): PhysicsShatterInput[] {
  return brushes.map((brush, index) => ({ sourceBrushId: `brush-${index}`, brush }));
}

/**
 * Returns the largest distance any piece vertex sits outside any piece plane.
 *
 * @param brush Piece brush.
 * @returns Worst outside distance; at most a tiny epsilon for convex pieces.
 */
export function physicsShatterTestConvexityError(brush: SolidBrush): number {
  let worst = 0;
  for (const plane of brush.planes)
    for (const vertex of brush.vertices) worst = Math.max(worst, plane.signedDistance(vertex));
  return worst;
}

/** Worst shape found among a fracture's pieces. */
export interface PhysicsShatterTestWorst {
  /** Thinnest piece, in metres. */
  thickness: number;
  /** Shortest edge, in metres. */
  edge: number;
  /** Smallest face area, in square metres. */
  faceArea: number;
  /** Largest vertex bulge outside a face plane. */
  bulge: number;
}

/**
 * Measures the worst piece shapes of a fracture.
 *
 * @param pieces Pieces.
 * @returns Worst thickness, edge, face area and bulge.
 */
export function physicsShatterTestWorst(pieces: readonly { brush: SolidBrush }[]): PhysicsShatterTestWorst {
  const worst = { thickness: Infinity, edge: Infinity, faceArea: Infinity, bulge: 0 };
  for (const piece of pieces) {
    const shape = physicsShatterPieceShape(piece.brush);
    worst.thickness = Math.min(worst.thickness, shape.thickness);
    worst.edge = Math.min(worst.edge, shape.minEdge);
    worst.faceArea = Math.min(worst.faceArea, shape.minFaceArea);
    worst.bulge = Math.max(worst.bulge, shape.bulge);
  }
  return worst;
}

/**
 * Expects a fracture to hold only sound pieces: none dropped, none left unsound
 * after healing, each at least the minimum thickness for its piece size, no
 * edge under 5 mm and every piece a valid convex solid.
 *
 * @param result Fracture result.
 * @param pieceSize Typical piece size of the pattern.
 * @param inputEdge Shortest edge of the inputs, when shorter than 5 mm: a piece
 *   keeps the input's own edges.
 * @param inputThickness Thickness of the thinnest input, when thinner than the
 *   minimum for the piece size: a piece of a thin pane is as thick as the
 *   pane.
 */
export function physicsShatterTestExpectSound(
  result: PhysicsShatterResult,
  pieceSize: number,
  inputEdge = PHYSICS_SHATTER_MIN_EDGE,
  inputThickness = Infinity,
): void {
  expect(result.droppedPieces).toBe(0);
  expect(result.unsoundPieces).toBe(0);
  const worst = physicsShatterTestWorst(result.pieces);
  const thickness = Math.min(physicsShatterMinThicknessForSize(pieceSize), 0.98 * inputThickness);
  expect(worst.thickness).toBeGreaterThanOrEqual(thickness - 1e-9);
  expect(worst.edge).toBeGreaterThanOrEqual(Math.min(PHYSICS_SHATTER_MIN_EDGE, 0.98 * inputEdge) - 1e-9);
  expect(worst.bulge).toBeLessThanOrEqual(PHYSICS_SHATTER_MAX_BULGE);
  for (const piece of result.pieces) expect(SolidBrushValidator.validateGenerated(piece.brush).valid).toBe(true);
}
