import * as THREE from 'three';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import type { HashedVertexTable } from '@/solid/algorithm/spatial/hashed_vertex_table.js';

/** Squared distance for consecutive ring cleanup only (not spatial-hash weld). */
const SQR_RING_DEDUPE_EPSILON = 1e-16;

/** Result of clipping a convex polygon against a plane. */
export interface PolygonClipResult {
  /** Portion of the polygon on the negative / inside side of the plane. */
  inside: THREE.Vector3[];
  /** Portion of the polygon on the positive / outside side of the plane. */
  outside: THREE.Vector3[];
}

/** Clips convex polygons against planes using the Sutherland-Hodgman algorithm. */
export class ConvexPolygonClipper {
  /**
   * Clips a convex polygon by a plane, producing inside and outside pieces.
   *
   * @param polygon Ordered convex polygon vertices.
   * @param plane Clipping plane (positive = outside).
   * @param epsilon Plane thickness for coplanar points.
   * @param vertexTable Optional welder for clip intersections and retained
   *   vertices.
   * @returns Inside and outside polygons (empty arrays when absent).
   */
  static clipByPlane(
    polygon: THREE.Vector3[],
    plane: SolidPlane,
    epsilon: number = SOLID_FAT_PLANE_EPSILON,
    vertexTable?: HashedVertexTable,
  ): PolygonClipResult {
    if (polygon.length < 3) {
      return { inside: [], outside: [] };
    }
    const inside: THREE.Vector3[] = [];
    const outside: THREE.Vector3[] = [];
    const count = polygon.length;
    for (let index = 0; index < count; index++) {
      const current = polygon[index]!;
      const next = polygon[(index + 1) % count]!;
      this.emitEdgeClipForEndpoints(current, next, plane, epsilon, inside, outside, vertexTable);
    }
    return {
      inside: this.dedupeClosedRing(inside),
      outside: this.dedupeClosedRing(outside),
    };
  }

  /**
   * Keeps only the portion of a polygon inside all planes of a convex solid.
   *
   * @param polygon Source convex polygon.
   * @param planes Outward planes of the solid.
   * @param vertexTable Optional welder shared across successive clips.
   * @returns Clipped polygon inside the solid, or empty if none.
   */
  static clipInsideAllPlanes(
    polygon: THREE.Vector3[],
    planes: SolidPlane[],
    vertexTable?: HashedVertexTable,
  ): THREE.Vector3[] {
    let current = polygon;
    for (const plane of planes) {
      current = this.clipByPlane(current, plane, SOLID_FAT_PLANE_EPSILON, vertexTable).inside;
      if (current.length < 3) {
        return [];
      }
    }
    return current.map((point) => point.clone());
  }

  /**
   * Classifies one polygon edge and emits clipped vertices into both rings.
   *
   * @param current Edge start.
   * @param next Edge end.
   * @param plane Clipping plane.
   * @param epsilon Fat-plane thickness.
   * @param inside Inside ring builder.
   * @param outside Outside ring builder.
   * @param vertexTable Optional vertex welder.
   */
  private static emitEdgeClipForEndpoints(
    current: THREE.Vector3,
    next: THREE.Vector3,
    plane: SolidPlane,
    epsilon: number,
    inside: THREE.Vector3[],
    outside: THREE.Vector3[],
    vertexTable: HashedVertexTable | undefined,
  ): void {
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
      outside,
      vertexTable,
    );
  }

  /**
   * Emits clip vertices for one polygon edge into inside/outside rings.
   *
   * @param current Edge start.
   * @param next Edge end.
   * @param currentDistance Signed distance of start.
   * @param nextDistance Signed distance of end.
   * @param currentInside Whether start is inside.
   * @param nextInside Whether end is inside.
   * @param plane Clipping plane.
   * @param inside Inside ring builder.
   * @param outside Outside ring builder.
   * @param vertexTable Optional vertex welder.
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
    outside: THREE.Vector3[],
    vertexTable: HashedVertexTable | undefined,
  ): void {
    if (currentInside && nextInside) {
      inside.push(this.emitVertex(next, vertexTable, false));
      return;
    }
    if (!currentInside && !nextInside) {
      outside.push(this.emitVertex(next, vertexTable, false));
      return;
    }
    this.emitCrossingEdge(
      current,
      next,
      currentDistance,
      nextDistance,
      currentInside,
      plane,
      inside,
      outside,
      vertexTable,
    );
  }

  /**
   * Emits the plane intersection and trailing endpoint for a straddling edge.
   *
   * @param current Edge start.
   * @param next Edge end.
   * @param currentDistance Signed distance of start.
   * @param nextDistance Signed distance of end.
   * @param currentInside Whether start is inside.
   * @param plane Clipping plane.
   * @param inside Inside ring builder.
   * @param outside Outside ring builder.
   * @param vertexTable Optional vertex welder.
   */
  private static emitCrossingEdge(
    current: THREE.Vector3,
    next: THREE.Vector3,
    currentDistance: number,
    nextDistance: number,
    currentInside: boolean,
    plane: SolidPlane,
    inside: THREE.Vector3[],
    outside: THREE.Vector3[],
    vertexTable: HashedVertexTable | undefined,
  ): void {
    const intersection = this.emitVertex(
      this.intersectSegmentPlane(current, next, currentDistance, nextDistance, plane),
      vertexTable,
      true,
    );
    const nextVertex = this.emitVertex(next, vertexTable, false);
    if (currentInside) {
      inside.push(intersection);
      outside.push(intersection);
      outside.push(nextVertex);
      return;
    }
    outside.push(intersection);
    inside.push(intersection);
    inside.push(nextVertex);
  }

  /**
   * Returns a snapped point when a vertex table is provided, otherwise a plain
   * clone.
   *
   * @param point Source point.
   * @param vertexTable Optional welder; when present, snaps the point.
   * @param _forceSnap Unused; snap always occurs when a vertex table is
   *   present.
   * @returns Point suitable for ring storage.
   */
  private static emitVertex(
    point: THREE.Vector3,
    vertexTable: HashedVertexTable | undefined,
    _forceSnap: boolean = false,
  ): THREE.Vector3 {
    void _forceSnap;
    if (vertexTable) {
      return vertexTable.snap(point);
    }
    return point.clone();
  }

  /**
   * Intersects a segment with a plane using precomputed distances.
   *
   * @param a Segment start.
   * @param b Segment end.
   * @param distanceA Distance of a.
   * @param distanceB Distance of b.
   * @param plane Unused; intersection is computed from precomputed distances.
   * @returns Intersection point.
   */
  private static intersectSegmentPlane(
    a: THREE.Vector3,
    b: THREE.Vector3,
    distanceA: number,
    distanceB: number,
    plane: SolidPlane,
  ): THREE.Vector3 {
    void plane;
    const denom = distanceA - distanceB;
    const t = Math.abs(denom) < 1e-20 ? 0.5 : distanceA / denom;
    return new THREE.Vector3().lerpVectors(a, b, t);
  }

  /**
   * Removes consecutive duplicate vertices from a polygon ring.
   *
   * @param ring Polygon vertices.
   * @returns Cleaned ring (may be empty).
   */
  private static dedupeClosedRing(ring: THREE.Vector3[]): THREE.Vector3[] {
    if (ring.length === 0) {
      return [];
    }
    const cleaned: THREE.Vector3[] = [];
    for (const point of ring) {
      this.appendIfNotDuplicateOfLast(cleaned, point);
    }
    this.popClosingDuplicate(cleaned);
    return cleaned.length >= 3 ? cleaned : [];
  }

  /**
   * Appends a point when it is not within squared ring-dedupe distance of the
   * previous vertex.
   *
   * @param cleaned Ring under construction.
   * @param point Candidate vertex.
   */
  private static appendIfNotDuplicateOfLast(cleaned: THREE.Vector3[], point: THREE.Vector3): void {
    const previous = cleaned[cleaned.length - 1];
    if (previous && previous.distanceToSquared(point) < SQR_RING_DEDUPE_EPSILON) {
      return;
    }
    cleaned.push(point);
  }

  /**
   * Removes the last vertex when it duplicates the first within ring epsilon.
   *
   * @param cleaned Ring under construction.
   */
  private static popClosingDuplicate(cleaned: THREE.Vector3[]): void {
    if (cleaned.length <= 1) {
      return;
    }
    if (cleaned[0]!.distanceToSquared(cleaned[cleaned.length - 1]!) < SQR_RING_DEDUPE_EPSILON) {
      cleaned.pop();
    }
  }
}
