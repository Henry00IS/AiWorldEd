import * as THREE from 'three';
import { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';
import { SOLID_FAT_PLANE_EPSILON, SOLID_NORMAL_ALIGN_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';

/** Classifies points and polygons against convex solid brushes. */
export class BrushMembership {
  /**
   * Returns true when a point is inside or on the boundary of a brush.
   *
   * @param point Point in the same space as brush planes.
   * @param planes Outward planes of the brush.
   * @param epsilon Fat-plane tolerance.
   * @returns True if inside the convex solid.
   */
  static isInsidePlanes(
    point: THREE.Vector3,
    planes: SolidPlane[],
    epsilon: number = SOLID_FAT_PLANE_EPSILON,
  ): boolean {
    for (const plane of planes) {
      if (plane.signedDistance(point) > epsilon) return false;
    }
    return true;
  }

  /**
   * Returns true when a point is strictly outside at least one plane.
   *
   * @param point Point to test.
   * @param planes Outward planes.
   * @param epsilon Fat-plane tolerance.
   * @returns True if outside the solid.
   */
  static isOutsidePlanes(
    point: THREE.Vector3,
    planes: SolidPlane[],
    epsilon: number = SOLID_FAT_PLANE_EPSILON,
  ): boolean {
    return !this.isInsidePlanes(point, planes, epsilon);
  }

  /**
   * Returns true when a point lies within the fat band of a plane that is not
   * parallel to the given surface normal, so the plane crosses the surface
   * there.
   *
   * @param point Point to test.
   * @param plane Plane to test against.
   * @param surfaceNormal Surface normal.
   * @returns True if the point is on the crossing plane.
   */
  static isOnCrossingPlane(point: THREE.Vector3, plane: SolidPlane, surfaceNormal: THREE.Vector3): boolean {
    return (
      Math.abs(plane.signedDistance(point)) <= SOLID_FAT_PLANE_EPSILON &&
      Math.abs(plane.normal.dot(surfaceNormal)) < SOLID_NORMAL_ALIGN_EPSILON
    );
  }

  /**
   * Classifies a point against a brush, detecting coplanar alignment.
   *
   * @param point Point in brush space.
   * @param brush Brush geometry.
   * @param surfaceNormal Optional surface normal for aligned detection.
   * @returns Surface category relative to the brush volume.
   */
  static classifyPoint(point: THREE.Vector3, brush: SolidBrush, surfaceNormal?: THREE.Vector3): SurfaceCategory {
    let minAbsDistance = Number.POSITIVE_INFINITY;
    let closestPlane: SolidPlane | null = null;
    for (const plane of brush.planes) {
      const distance = plane.signedDistance(point);
      if (distance > SOLID_FAT_PLANE_EPSILON) {
        return SurfaceCategory.Outside;
      }
      const absDistance = Math.abs(distance);
      if (absDistance < minAbsDistance) {
        minAbsDistance = absDistance;
        closestPlane = plane;
      }
    }
    if (closestPlane && minAbsDistance <= SOLID_FAT_PLANE_EPSILON && surfaceNormal) {
      const dot = closestPlane.normal.dot(surfaceNormal);
      if (dot >= SOLID_NORMAL_ALIGN_EPSILON) return SurfaceCategory.Aligned;
      if (dot <= -SOLID_NORMAL_ALIGN_EPSILON) return SurfaceCategory.ReverseAligned;
    }
    return SurfaceCategory.Inside;
  }

  /**
   * Classifies a polygon relative to a brush using its centroid and normal.
   *
   * @param polygon Convex polygon vertices.
   * @param brush Brush geometry in the same space.
   * @param surfaceNormal Polygon plane normal.
   * @returns Category of the polygon relative to the brush.
   */
  static classifyPolygon(polygon: THREE.Vector3[], brush: SolidBrush, surfaceNormal: THREE.Vector3): SurfaceCategory {
    this.polygonCentroidInto(polygon, scratchCentroid);
    return this.classifyPoint(scratchCentroid, brush, surfaceNormal);
  }

  /**
   * Computes the arithmetic centroid of a polygon.
   *
   * @param polygon Vertex list.
   * @returns Centroid point.
   */
  static polygonCentroid(polygon: THREE.Vector3[]): THREE.Vector3 {
    return this.polygonCentroidInto(polygon, new THREE.Vector3());
  }

  /**
   * Writes the arithmetic centroid of a polygon into a target vector.
   *
   * @param polygon Vertex list.
   * @param target Output vector.
   * @returns The target vector for chaining.
   */
  static polygonCentroidInto(polygon: THREE.Vector3[], target: THREE.Vector3): THREE.Vector3 {
    target.set(0, 0, 0);
    for (const point of polygon) {
      target.add(point);
    }
    if (polygon.length > 0) {
      target.multiplyScalar(1 / polygon.length);
    }
    return target;
  }
}

/** Shared scratch centroid for classifyPolygon hot-path reuse. */
const scratchCentroid = new THREE.Vector3();
