/**
 * Classification of a surface fragment relative to solid volumes.
 * Self-aligned categories mark surfaces owned by the subject brush;
 * plain aligned categories mark coplanar contact with another brush.
 */
export enum SurfaceCategory {
  Inside = 0,
  Aligned = 1,
  SelfAligned = 2,
  SelfReverseAligned = 3,
  ReverseAligned = 4,
  Outside = 5
}

/**
 * Categories that contribute geometry to the final solid mesh.
 * Only subject-owned surfaces are emitted so coplanar peer faces cancel.
 */
export const KEEP_SURFACE_CATEGORIES: ReadonlySet<SurfaceCategory> = new Set([
  SurfaceCategory.SelfAligned,
  SurfaceCategory.SelfReverseAligned
]);

/**
 * Returns whether a category should emit renderable surface geometry.
 * @param category Fragment category after full routing.
 * @returns True when the fragment is a subject-owned solid boundary.
 */
export function shouldKeepSurfaceCategory(category: SurfaceCategory): boolean {
  return KEEP_SURFACE_CATEGORIES.has(category);
}

/**
 * Returns whether a category requires winding/normal flip for cavities.
 * @param category Final surface category.
 * @returns True when the polygon must be reversed.
 */
export function shouldReverseSurfaceWinding(category: SurfaceCategory): boolean {
  return (
    category === SurfaceCategory.ReverseAligned ||
    category === SurfaceCategory.SelfReverseAligned
  );
}
