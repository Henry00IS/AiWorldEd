import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import { physicsShatterBrushVolume } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_geometry.js';
import type { PhysicsShatterPolytope } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_polytope.js';

/** One convex part of an input brush with the origin of each face. */
export interface PhysicsShatterIntactPart {
  /** Convex part geometry. */
  brush: SolidBrush;
  /** Polytope face origin per brush face. */
  origins: readonly number[];
}

/** Distance a vertex may lie outside a plane and still count as behind it. */
const PHYSICS_SHATTER_INTACT_SUPPORT_DISTANCE = 1e-7;

/** Share of the summed volume two parts may differ from their merge by. */
const PHYSICS_SHATTER_INTACT_MERGE_TOLERANCE = 1e-7;

/** Smallest absolute volume difference always accepted, in cubic metres. */
const PHYSICS_SHATTER_INTACT_MERGE_FLOOR = 1e-12;

/**
 * Merges neighbouring parts whose union is convex, pair by pair in list order,
 * until no pair merges. The result covers the same space with fewer parts.
 *
 * @param parts Disjoint convex parts of one input.
 * @param whole The uncut input as a polytope whose faces carry input origins.
 * @returns Merged parts in a deterministic order.
 */
export function physicsShatterIntactMergeAll(
  parts: readonly PhysicsShatterIntactPart[],
  whole: PhysicsShatterPolytope,
): PhysicsShatterIntactPart[] {
  const merged = parts.slice();
  for (let first = 0; first < merged.length; first++) {
    for (let second = first + 1; second < merged.length; second++) {
      const union = physicsShatterIntactMergePair(merged[first], merged[second], whole);
      if (!union) continue;
      merged[first] = union;
      merged.splice(second, 1);
      second = first;
    }
  }
  return merged;
}

/**
 * Returns the union of two disjoint convex parts when it is convex. The union
 * is cut from the whole input by every face plane of either part that has the
 * other part behind it; it is convex exactly when that cut holds no more volume
 * than the two parts together.
 *
 * @param first First part.
 * @param second Second part.
 * @param whole The uncut input polytope with input face origins.
 * @returns Merged part, or null when the union is not convex.
 */
export function physicsShatterIntactMergePair(
  first: PhysicsShatterIntactPart | undefined,
  second: PhysicsShatterIntactPart | undefined,
  whole: PhysicsShatterPolytope,
): PhysicsShatterIntactPart | null {
  if (!first || !second) return null;
  let cut: PhysicsShatterPolytope | null = whole;
  for (const support of [
    ...physicsShatterIntactSupports(first, second),
    ...physicsShatterIntactSupports(second, first),
  ]) {
    cut = cut.clip(support.plane, support.origin);
    if (!cut) return null;
  }
  const expected = physicsShatterBrushVolume(first.brush) + physicsShatterBrushVolume(second.brush);
  const slack = Math.max(PHYSICS_SHATTER_INTACT_MERGE_FLOOR, PHYSICS_SHATTER_INTACT_MERGE_TOLERANCE * expected);
  if (Math.abs(cut.volume() - expected) > slack) return null;
  return cut.toBrush();
}

/**
 * Lists the face planes of one part that have every vertex of another part
 * behind them, with the face origins.
 *
 * @param owner Part whose planes are tested.
 * @param other Part that must lie behind them.
 * @returns Supporting planes with their origins.
 */
function physicsShatterIntactSupports(
  owner: PhysicsShatterIntactPart,
  other: PhysicsShatterIntactPart,
): { plane: SolidPlane; origin: number }[] {
  const supports: { plane: SolidPlane; origin: number }[] = [];
  owner.brush.planes.forEach((plane, face) => {
    const behind = other.brush.vertices.every(
      (vertex) => plane.signedDistance(vertex) <= PHYSICS_SHATTER_INTACT_SUPPORT_DISTANCE,
    );
    if (behind) supports.push({ plane, origin: owner.origins[face] ?? -1 });
  });
  return supports;
}
