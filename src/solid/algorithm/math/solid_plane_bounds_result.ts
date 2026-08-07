/**
 * Classification of an axis-aligned bounds against a plane half-space.
 * Intersecting means the bounds straddles the plane; Inside means fully on the
 * negative side; Outside means fully on the positive side.
 */
export enum SolidPlaneBoundsResult {
  Intersecting = 0,
  Inside = 1,
  Outside = 2,
}
