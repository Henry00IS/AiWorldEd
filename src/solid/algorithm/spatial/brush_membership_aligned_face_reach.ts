import type * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';

/**
 * Farthest a point may lie, along the plane of the brush face it is aligned
 * with, outside that face's outline and still count as lying on the face. A
 * brush side meeting the face at an angle θ lets the fat band reach
 * SOLID_FAT_PLANE_EPSILON / sin θ along the face, so this only rules on sides
 * meeting the face at under about 14.5 degrees: thin wedges, such as the slices
 * of a curved trim, whose fat band runs far along the face.
 */
export const BRUSH_MEMBERSHIP_ALIGNED_FACE_REACH = 4 * SOLID_FAT_PLANE_EPSILON;

/**
 * Squared sine below which a brush plane counts as parallel to the aligned
 * face.
 */
const BRUSH_MEMBERSHIP_PARALLEL_SINE_SQUARED = 1e-12;

/**
 * Tells whether a point found aligned with a brush face, because it lies in the
 * fat band of the face's plane, also lies on the face itself rather than beside
 * the face's outline.
 */
export class BrushMembershipAlignedFaceReach {
  /**
   * Returns true when the point, moved onto the brush plane it is closest to,
   * lies farther than the reach outside one of the brush's other planes,
   * measured along that closest plane: the point is then clearly off the face.
   *
   * @param point Point in the same space as the brush planes.
   * @param brush Brush whose closest face the point was found aligned with.
   * @param reach Allowed distance outside the face outline along its plane.
   * @returns True if the point lies clearly off the closest face.
   */
  static isPointOffClosestFace(
    point: THREE.Vector3,
    brush: SolidBrush,
    reach: number = BRUSH_MEMBERSHIP_ALIGNED_FACE_REACH,
  ): boolean {
    const closest = this.closestPlane(point, brush);
    if (!closest) {
      return false;
    }
    const closestDistance = closest.signedDistance(point);
    return brush.planes.some(
      (plane) => plane !== closest && this.distanceAlongPlane(point, plane, closest, closestDistance) > reach,
    );
  }

  /**
   * Returns the brush plane with the smallest absolute distance to the point,
   * the same plane membership classification tests for alignment.
   *
   * @param point Point to measure.
   * @param brush Brush whose planes are searched.
   * @returns Closest plane, or null for a brush without planes.
   */
  static closestPlane(point: THREE.Vector3, brush: SolidBrush): SolidPlane | null {
    let closest: SolidPlane | null = null;
    let closestAbsoluteDistance = Number.POSITIVE_INFINITY;
    for (const plane of brush.planes) {
      const absoluteDistance = Math.abs(plane.signedDistance(point));
      if (absoluteDistance < closestAbsoluteDistance) {
        closest = plane;
        closestAbsoluteDistance = absoluteDistance;
      }
    }
    return closest;
  }

  /**
   * Returns how far the point, moved onto the face plane, lies outside a side
   * plane, measured within the face plane. Side planes parallel to the face
   * plane bound nothing within it and give negative infinity.
   *
   * @param point Point to measure.
   * @param sidePlane Brush plane bounding the face.
   * @param facePlane Plane of the face.
   * @param faceDistance Signed distance of the point to the face plane.
   * @returns Distance outside the side, along the face plane.
   */
  static distanceAlongPlane(
    point: THREE.Vector3,
    sidePlane: SolidPlane,
    facePlane: SolidPlane,
    faceDistance: number,
  ): number {
    const cosine = sidePlane.normal.dot(facePlane.normal);
    const sineSquared = 1 - cosine * cosine;
    if (sineSquared < BRUSH_MEMBERSHIP_PARALLEL_SINE_SQUARED) {
      return Number.NEGATIVE_INFINITY;
    }
    return (sidePlane.signedDistance(point) - cosine * faceDistance) / Math.sqrt(sineSquared);
  }
}
