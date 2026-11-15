import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type {
  PhysicsShatterInput,
  PhysicsShatterSettings,
} from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_types.js';

/**
 * Returns fracture settings for tests, with overrides.
 *
 * @param overrides Settings to change.
 * @returns Complete settings.
 */
export function physicsShatterTestSettings(overrides: Partial<PhysicsShatterSettings> = {}): PhysicsShatterSettings {
  return {
    mode: 'glass',
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
