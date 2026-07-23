import * as THREE from 'three';
import { SolidPlane } from '../brush/solid_plane.js';
import { SOLID_FAT_PLANE_EPSILON } from './solid_math_constants.js';

/**
 * Result of clipping a convex polygon against a plane.
 */
export interface PolygonClipResult {
  /** Portion of the polygon on the negative / inside side of the plane. */
  inside: THREE.Vector3[];
  /** Portion of the polygon on the positive / outside side of the plane. */
  outside: THREE.Vector3[];
}

/**
 * Clips convex polygons against planes using Sutherland–Hodgman.
 * Used by Sander-style solid CSG for face fragmentation (not the editor BSP soup).
 */
export class ConvexPolygonClipper {
  /**
   * Clips a convex polygon by a plane, producing inside and outside pieces.
   * @param polygon Ordered convex polygon vertices.
   * @param plane Clipping plane (positive = outside).
   * @param epsilon Plane thickness for coplanar points.
   * @returns Inside and outside polygons (empty arrays when absent).
   */
  static clipByPlane(
    polygon: THREE.Vector3[],
    plane: SolidPlane,
    epsilon: number = SOLID_FAT_PLANE_EPSILON
  ): PolygonClipResult {
    if (polygon.length < 3) {
      return { inside: [], outside: [] };
    }
    const inside: THREE.Vector3[] = [];
    const outside: THREE.Vector3[] = [];
    const count = polygon.length;
    for (let index = 0; index < count; index++) {
      const current = polygon[index];
      const next = polygon[(index + 1) % count];
      const currentDistance = plane.signedDistance(current);
      const nextDistance = plane.signedDistance(next);
      const currentInside = currentDistance <= epsilon;
      const nextInside = nextDistance <= epsilon;
      this.emitEdgeClip(
        current,
        next,
        currentDistance,
        nextDistance,
        currentInside,
        nextInside,
        plane,
        inside,
        outside
      );
    }
    return {
      inside: this.dedupeClosedRing(inside),
      outside: this.dedupeClosedRing(outside)
    };
  }

  /**
   * Keeps only the portion of a polygon inside all planes of a convex solid.
   * @param polygon Source convex polygon.
   * @param planes Outward planes of the solid.
   * @returns Clipped polygon inside the solid, or empty if none.
   */
  static clipInsideAllPlanes(
    polygon: THREE.Vector3[],
    planes: SolidPlane[]
  ): THREE.Vector3[] {
    let current = polygon.map((point) => point.clone());
    for (const plane of planes) {
      current = this.clipByPlane(current, plane).inside;
      if (current.length < 3) return [];
    }
    return current;
  }

  /**
   * Emits clip vertices for one polygon edge into inside/outside rings.
   * @param current Edge start.
   * @param next Edge end.
   * @param currentDistance Signed distance of start.
   * @param nextDistance Signed distance of end.
   * @param currentInside Whether start is inside.
   * @param nextInside Whether end is inside.
   * @param plane Clipping plane.
   * @param inside Inside ring builder.
   * @param outside Outside ring builder.
   */
  private static emitEdgeClip(
    current: THREE.Vector3,
    next: THREE.Vector3,
    currentDistance: number,
    nextDistance: number,
    currentInside: boolean,
    nextInside: boolean,
    plane: SolidPlane,
    inside: THREE.Vector3[],
    outside: THREE.Vector3[]
  ): void {
    if (currentInside && nextInside) {
      inside.push(next.clone());
      return;
    }
    if (!currentInside && !nextInside) {
      outside.push(next.clone());
      return;
    }
    const intersection = this.intersectSegmentPlane(
      current,
      next,
      currentDistance,
      nextDistance,
      plane
    );
    if (currentInside) {
      inside.push(intersection.clone());
      outside.push(intersection.clone());
      outside.push(next.clone());
      return;
    }
    outside.push(intersection.clone());
    inside.push(intersection.clone());
    inside.push(next.clone());
  }

  /**
   * Intersects a segment with a plane using precomputed distances.
   * @param a Segment start.
   * @param b Segment end.
   * @param distanceA Distance of a.
   * @param distanceB Distance of b.
   * @param plane Plane (unused except for API clarity).
   * @returns Intersection point.
   */
  private static intersectSegmentPlane(
    a: THREE.Vector3,
    b: THREE.Vector3,
    distanceA: number,
    distanceB: number,
    plane: SolidPlane
  ): THREE.Vector3 {
    void plane;
    const denom = distanceA - distanceB;
    const t = Math.abs(denom) < 1e-20 ? 0.5 : distanceA / denom;
    return new THREE.Vector3().lerpVectors(a, b, t);
  }

  /**
   * Removes consecutive duplicate vertices from a polygon ring.
   * @param ring Polygon vertices.
   * @returns Cleaned ring (may be empty).
   */
  private static dedupeClosedRing(ring: THREE.Vector3[]): THREE.Vector3[] {
    if (ring.length === 0) return [];
    const cleaned: THREE.Vector3[] = [];
    for (const point of ring) {
      const previous = cleaned[cleaned.length - 1];
      if (previous && previous.distanceToSquared(point) < 1e-16) continue;
      cleaned.push(point);
    }
    if (
      cleaned.length > 1 &&
      cleaned[0].distanceToSquared(cleaned[cleaned.length - 1]) < 1e-16
    ) {
      cleaned.pop();
    }
    return cleaned.length >= 3 ? cleaned : [];
  }
}
