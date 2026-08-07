import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import type { AxisAlignedBounds } from '@/solid/algorithm/spatial/bounds_overlap.js';
import { SOLID_FAT_PLANE_EPSILON, SOLID_PLANE_CUT_EPSILON } from './solid_math_constants.js';
import { SolidPlaneBoundsResult } from './solid_plane_bounds_result.js';

/** Classifies axis-aligned bounds against a plane half-space. */
export class SolidPlaneBounds {
  /**
   * Returns whether the entire bounds lies strictly inside the plane half-space
   * (negative side).
   *
   * @param plane Plane whose positive half-space is treated as outside.
   * @param bounds Axis-aligned bounds to test.
   * @param epsilon Distance epsilon; defaults to SOLID_PLANE_CUT_EPSILON.
   * @returns True when every bounds corner is strictly inside.
   */
  static isInside(plane: SolidPlane, bounds: AxisAlignedBounds, epsilon: number = SOLID_PLANE_CUT_EPSILON): boolean {
    const normal = plane.normal;
    const x = normal.x < 0 ? bounds.min.x : bounds.max.x;
    const y = normal.y < 0 ? bounds.min.y : bounds.max.y;
    const z = normal.z < 0 ? bounds.min.z : bounds.max.z;
    const distance = normal.x * x + normal.y * y + normal.z * z + plane.offset;
    return distance < -epsilon;
  }

  /**
   * Returns whether the entire bounds lies strictly outside the plane
   * half-space (positive side).
   *
   * @param plane Plane whose positive half-space is treated as outside.
   * @param bounds Axis-aligned bounds to test.
   * @param epsilon Distance epsilon; defaults to SOLID_PLANE_CUT_EPSILON.
   * @returns True when every bounds corner is strictly outside.
   */
  static isOutside(plane: SolidPlane, bounds: AxisAlignedBounds, epsilon: number = SOLID_PLANE_CUT_EPSILON): boolean {
    const normal = plane.normal;
    const x = normal.x >= 0 ? bounds.min.x : bounds.max.x;
    const y = normal.y >= 0 ? bounds.min.y : bounds.max.y;
    const z = normal.z >= 0 ? bounds.min.z : bounds.max.z;
    const distance = normal.x * x + normal.y * y + normal.z * z + plane.offset;
    return distance > epsilon;
  }

  /**
   * Classifies bounds against a plane as Outside, Inside, or Intersecting.
   *
   * @param plane Plane whose positive half-space is treated as outside.
   * @param bounds Axis-aligned bounds to classify.
   * @param epsilon Distance epsilon; defaults to SOLID_PLANE_CUT_EPSILON.
   * @returns Outside when fully positive, Inside when fully negative, otherwise
   *   Intersecting.
   */
  static classify(
    plane: SolidPlane,
    bounds: AxisAlignedBounds,
    epsilon: number = SOLID_PLANE_CUT_EPSILON,
  ): SolidPlaneBoundsResult {
    const normal = plane.normal;
    const forwardX = normal.x < 0 ? bounds.max.x : bounds.min.x;
    const forwardY = normal.y < 0 ? bounds.max.y : bounds.min.y;
    const forwardZ = normal.z < 0 ? bounds.max.z : bounds.min.z;
    const forward = normal.x * forwardX + normal.y * forwardY + normal.z * forwardZ + plane.offset;
    if (forward > epsilon) {
      return SolidPlaneBoundsResult.Outside;
    }
    const backwardX = normal.x >= 0 ? bounds.max.x : bounds.min.x;
    const backwardY = normal.y >= 0 ? bounds.max.y : bounds.min.y;
    const backwardZ = normal.z >= 0 ? bounds.max.z : bounds.min.z;
    const backward = normal.x * backwardX + normal.y * backwardY + normal.z * backwardZ + plane.offset;
    if (backward < -epsilon) {
      return SolidPlaneBoundsResult.Inside;
    }
    return SolidPlaneBoundsResult.Intersecting;
  }

  /**
   * Classifies bounds against a plane using a fat distance epsilon.
   *
   * @param plane Plane whose positive half-space is treated as outside.
   * @param bounds Axis-aligned bounds to classify.
   * @param epsilon Fat distance epsilon; defaults to SOLID_FAT_PLANE_EPSILON.
   * @returns Outside, Inside, or Intersecting using the fat epsilon.
   */
  static classifyFat(
    plane: SolidPlane,
    bounds: AxisAlignedBounds,
    epsilon: number = SOLID_FAT_PLANE_EPSILON,
  ): SolidPlaneBoundsResult {
    return this.classify(plane, bounds, epsilon);
  }
}
