import * as THREE from 'three';
import { SolidBrush } from '../brush/solid_brush.js';
import { SolidPlane } from '../brush/solid_plane.js';
import { SurfaceCategory } from '../types/surface_category.js';
import { SOLID_FAT_PLANE_EPSILON } from './solid_math_constants.js';

/**
 * Classifies points and polygons against convex solid brushes.
 */
export class BrushMembership {
  /**
   * Returns true when a point is inside or on the boundary of a brush.
   * @param point Point in the same space as brush planes.
   * @param planes Outward planes of the brush.
   * @param epsilon Fat-plane tolerance.
   * @returns True if inside the convex solid.
   */
  static isInsidePlanes(
    point: THREE.Vector3,
    planes: SolidPlane[],
    epsilon: number = SOLID_FAT_PLANE_EPSILON
  ): boolean {
    for (const plane of planes) {
      if (plane.signedDistance(point) > epsilon) return false;
    }
    return true;
  }

  /**
   * Returns true when a point is strictly outside at least one plane.
   * @param point Point to test.
   * @param planes Outward planes.
   * @param epsilon Fat-plane tolerance.
   * @returns True if outside the solid.
   */
  static isOutsidePlanes(
    point: THREE.Vector3,
    planes: SolidPlane[],
    epsilon: number = SOLID_FAT_PLANE_EPSILON
  ): boolean {
    return !this.isInsidePlanes(point, planes, epsilon);
  }

  /**
   * Classifies a point against a brush, detecting coplanar alignment.
   * @param point Point in brush space.
   * @param brush Brush geometry.
   * @param surfaceNormal Optional surface normal for aligned detection.
   * @returns Surface category relative to the brush volume.
   */
  static classifyPoint(
    point: THREE.Vector3,
    brush: SolidBrush,
    surfaceNormal?: THREE.Vector3
  ): SurfaceCategory {
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
      if (dot >= 0.99) return SurfaceCategory.Aligned;
      if (dot <= -0.99) return SurfaceCategory.ReverseAligned;
    }
    return SurfaceCategory.Inside;
  }

  /**
   * Classifies a polygon relative to a brush using its centroid and normal.
   * @param polygon Convex polygon vertices.
   * @param brush Brush geometry in the same space.
   * @param surfaceNormal Polygon plane normal.
   * @returns Category of the polygon relative to the brush.
   */
  static classifyPolygon(
    polygon: THREE.Vector3[],
    brush: SolidBrush,
    surfaceNormal: THREE.Vector3
  ): SurfaceCategory {
    const centroid = this.polygonCentroid(polygon);
    return this.classifyPoint(centroid, brush, surfaceNormal);
  }

  /**
   * Computes the arithmetic centroid of a polygon.
   * @param polygon Vertex list.
   * @returns Centroid point.
   */
  static polygonCentroid(polygon: THREE.Vector3[]): THREE.Vector3 {
    const centroid = new THREE.Vector3();
    for (const point of polygon) {
      centroid.add(point);
    }
    if (polygon.length > 0) {
      centroid.multiplyScalar(1 / polygon.length);
    }
    return centroid;
  }
}
