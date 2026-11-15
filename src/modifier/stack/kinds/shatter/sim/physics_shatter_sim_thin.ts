import type { PhysicsShatterPiece } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_types.js';

/** Pieces the thin-piece check reads: the convex geometry and its hull. */
export type PhysicsShatterThinPiece = Pick<PhysicsShatterPiece, 'brush' | 'hull'>;

/**
 * Returns the thinnest a piece may be: 2 cm or a tenth of the crack size,
 * whichever is larger. TODO: call the fracture's exported minimum-thickness
 * rule once it lands.
 *
 * @param crackSize Crack size in metres.
 * @returns Minimum thickness in metres.
 */
export function physicsShatterSimMinThickness(crackSize: number): number {
  return Math.max(0.02, 0.1 * crackSize);
}

/**
 * Returns the thickness of a convex piece: its smallest width across any of its
 * face normals.
 *
 * @param piece Piece.
 * @returns Thickness in metres.
 */
export function physicsShatterSimThickness(piece: PhysicsShatterThinPiece): number {
  let thinnest = Infinity;
  for (const { normal } of piece.brush.planes) {
    let low = Infinity;
    let high = -Infinity;
    for (let offset = 0; offset + 2 < piece.hull.length; offset += 3) {
      const along =
        normal.x * piece.hull[offset]! + normal.y * piece.hull[offset + 1]! + normal.z * piece.hull[offset + 2]!;
      low = Math.min(low, along);
      high = Math.max(high, along);
    }
    thinnest = Math.min(thinnest, high - low);
  }
  return thinnest;
}

/**
 * Warns once on the console when pieces thinner than the minimum reach the
 * simulation. The pieces are left as they are.
 *
 * @param pieces Pieces about to be simulated.
 * @param crackSize Crack size in metres.
 * @returns How many pieces are too thin and the smallest thickness.
 */
export function physicsShatterSimWarnThin(
  pieces: readonly PhysicsShatterThinPiece[],
  crackSize: number,
): { count: number; smallest: number } {
  const minimum = physicsShatterSimMinThickness(crackSize);
  const thin = pieces.map(physicsShatterSimThickness).filter((thickness) => thickness < minimum);
  const smallest = thin.length > 0 ? Math.min(...thin) : Infinity;
  if (thin.length > 0)
    console.warn(
      `Physics Shatter: ${thin.length} piece(s) thinner than ${(minimum * 100).toFixed(1)} cm reach the simulation; ` +
        `the thinnest is ${(smallest * 100).toFixed(2)} cm.`,
    );
  return { count: thin.length, smallest };
}
