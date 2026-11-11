import * as THREE from 'three';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import { HashedVertexTable } from '@/solid/algorithm/spatial/hashed_vertex_table.js';
import { ConvexPolygonClipper } from './convex_polygon_clipper.js';
import type { SolidAlgorithmSurfaceLoop } from './solid_algorithm_surface_loop.js';

/** Scratch edge direction for building loop edge planes. */
const scratchEdge = new THREE.Vector3();
/** Scratch offset from an edge start to the loop centroid. */
const scratchToCentroid = new THREE.Vector3();

/** Inward loop edge planes last built for one fragment normal. */
interface SolidLoopEdgePlaneCache {
  normal: THREE.Vector3 | null;
  planes: SolidPlane[];
}

/**
 * Splits a convex face by bounded intersection loops using successive local
 * edge half-planes, welding clip vertices through a shared table.
 */
export class SolidAlgorithmLoopFaceSplitter {
  /**
   * Splits face vertices by every intersection loop on that face.
   *
   * @param faceVertices Ordered face polygon.
   * @param faceLoops Intersection loops on this face.
   * @param vertexTable Welder shared across faces of one brush.
   * @returns Non-empty convex fragments covering the face.
   */
  static splitByLoops(
    faceVertices: readonly THREE.Vector3[],
    faceLoops: readonly SolidAlgorithmSurfaceLoop[],
    vertexTable: HashedVertexTable,
  ): THREE.Vector3[][] {
    if (faceVertices.length < 3) {
      return [];
    }
    const seed = this.weldPolygon(faceVertices, vertexTable);
    if (faceLoops.length === 0) {
      return [seed];
    }
    let fragments: THREE.Vector3[][] = [seed];
    for (const loop of faceLoops) {
      if (loop.loopVertices.length < 3) {
        continue;
      }
      const weldedLoop = this.weldPolygon(loop.loopVertices, vertexTable);
      fragments = this.splitFragmentsByOneLoop(fragments, weldedLoop, vertexTable);
    }
    return fragments.filter((fragment) => fragment.length >= 3);
  }

  /**
   * Welds every vertex of a polygon into the shared table.
   *
   * @param polygon Source vertices.
   * @param vertexTable Welder.
   * @returns Cloned welded ring.
   */
  static weldPolygon(polygon: readonly THREE.Vector3[], vertexTable: HashedVertexTable): THREE.Vector3[] {
    const welded: THREE.Vector3[] = [];
    for (const vertex of polygon) {
      welded.push(vertexTable.snap(vertex));
    }
    return welded;
  }

  /**
   * Splits fragments that overlap a loop; leaves distant fragments unchanged.
   *
   * @param fragments Current face fragments.
   * @param loopVertices Welded convex loop vertices.
   * @param vertexTable Welder for clip intersections.
   * @returns Updated fragments.
   */
  static splitFragmentsByOneLoop(
    fragments: readonly THREE.Vector3[][],
    loopVertices: readonly THREE.Vector3[],
    vertexTable: HashedVertexTable,
  ): THREE.Vector3[][] {
    const loopBounds = this.loopBoundsExpanded(loopVertices);
    const next: THREE.Vector3[][] = [];
    const planeCache: SolidLoopEdgePlaneCache = { normal: null, planes: [] };
    for (const fragment of fragments) {
      if (!this.fragmentOverlapsBounds(fragment, loopBounds)) {
        next.push(fragment);
        continue;
      }
      const firstPiece = next.length;
      this.appendSplitByConvexLoop(fragment, loopVertices, vertexTable, next, planeCache);
      this.keepFragmentWhenUncut(fragment, next, firstPiece);
    }
    return next;
  }

  /**
   * Puts the original fragment object back when splitting it produced one piece
   * with exactly the same vertices, so unchanged fragments keep their identity
   * across splits.
   *
   * @param fragment Fragment that was split.
   * @param next Output list holding the pieces.
   * @param firstPiece Index of the first piece produced from the fragment.
   */
  private static keepFragmentWhenUncut(fragment: THREE.Vector3[], next: THREE.Vector3[][], firstPiece: number): void {
    const piece = next[firstPiece];
    if (next.length !== firstPiece + 1 || !piece || piece.length !== fragment.length) {
      return;
    }
    for (let index = 0; index < piece.length; index++) {
      const original = fragment[index];
      if (!original || !piece[index]?.equals(original)) return;
    }
    next[firstPiece] = fragment;
  }

  /**
   * Builds an expanded AABB around a loop for early rejection.
   *
   * @param loopVertices Loop vertices.
   * @returns Expanded bounds.
   */
  private static loopBoundsExpanded(loopVertices: readonly THREE.Vector3[]): THREE.Box3 {
    const loopBounds = new THREE.Box3().setFromPoints(loopVertices as THREE.Vector3[]);
    loopBounds.expandByScalar(SOLID_FAT_PLANE_EPSILON * 4);
    return loopBounds;
  }

  /**
   * Returns whether a fragment AABB overlaps loop bounds.
   *
   * @param fragment Fragment vertices.
   * @param loopBounds Loop AABB.
   * @returns True when bounds overlap.
   */
  private static fragmentOverlapsBounds(fragment: readonly THREE.Vector3[], loopBounds: THREE.Box3): boolean {
    if (fragment.length === 0) {
      return false;
    }
    return (
      this.axisOverlaps(fragment, 'x', loopBounds.min.x, loopBounds.max.x) &&
      this.axisOverlaps(fragment, 'y', loopBounds.min.y, loopBounds.max.y) &&
      this.axisOverlaps(fragment, 'z', loopBounds.min.z, loopBounds.max.z)
    );
  }

  /**
   * Returns whether the extent of a fragment along one axis overlaps an
   * interval, without allocating bounds.
   *
   * @param fragment Non-empty fragment vertices.
   * @param axis Axis to test.
   * @param low Interval start.
   * @param high Interval end.
   * @returns True when the closed extents overlap.
   */
  private static axisOverlaps(
    fragment: readonly THREE.Vector3[],
    axis: 'x' | 'y' | 'z',
    low: number,
    high: number,
  ): boolean {
    let fragmentLow = Infinity;
    let fragmentHigh = -Infinity;
    for (const vertex of fragment) {
      const value = vertex[axis];
      if (value < fragmentLow) fragmentLow = value;
      if (value > fragmentHigh) fragmentHigh = value;
    }
    return !(fragmentHigh < low || fragmentLow > high);
  }

  /**
   * Splits one fragment into inside-loop and outside-loop convex pieces.
   *
   * @param fragment Convex fragment.
   * @param loopVertices Convex loop.
   * @param vertexTable Welder.
   * @param next Output list.
   * @param planeCache Edge planes of the loop for the last fragment normal.
   */
  private static appendSplitByConvexLoop(
    fragment: readonly THREE.Vector3[],
    loopVertices: readonly THREE.Vector3[],
    vertexTable: HashedVertexTable,
    next: THREE.Vector3[][],
    planeCache: SolidLoopEdgePlaneCache,
  ): void {
    const edgePlanes = this.edgePlanesFor(loopVertices, this.polygonNormal(fragment), planeCache);
    if (edgePlanes.length < 3) {
      next.push(this.weldPolygon(fragment, vertexTable));
      return;
    }
    let remaining: THREE.Vector3[][] = [this.weldPolygon(fragment, vertexTable)];
    for (const plane of edgePlanes) {
      remaining = this.clipRemainingPieces(remaining, plane, vertexTable, next);
    }
    for (const insidePiece of remaining) {
      next.push(insidePiece);
    }
  }

  /**
   * Returns the inward edge planes of a loop for a fragment normal, reusing the
   * planes of the previous fragment when its normal is exactly the same.
   *
   * @param loopVertices Loop vertices.
   * @param faceNormal Fragment normal.
   * @param planeCache Planes built for the last normal, updated in place.
   * @returns Inward planes.
   */
  private static edgePlanesFor(
    loopVertices: readonly THREE.Vector3[],
    faceNormal: THREE.Vector3,
    planeCache: SolidLoopEdgePlaneCache,
  ): SolidPlane[] {
    if (planeCache.normal?.equals(faceNormal)) {
      return planeCache.planes;
    }
    planeCache.normal = faceNormal;
    planeCache.planes = this.buildInwardEdgePlanes(loopVertices, faceNormal);
    return planeCache.planes;
  }

  /**
   * Clips each remaining inside piece by one loop edge plane.
   *
   * @param remaining Inside pieces still being cut.
   * @param plane Inward edge plane.
   * @param vertexTable Welder.
   * @param outsideAccumulator Receives outside pieces.
   * @returns New remaining inside pieces.
   */
  private static clipRemainingPieces(
    remaining: readonly THREE.Vector3[][],
    plane: SolidPlane,
    vertexTable: HashedVertexTable,
    outsideAccumulator: THREE.Vector3[][],
  ): THREE.Vector3[][] {
    const nextRemaining: THREE.Vector3[][] = [];
    for (const piece of remaining) {
      const clipped = ConvexPolygonClipper.clipWeldedByPlane(piece, plane, SOLID_FAT_PLANE_EPSILON, vertexTable);
      if (clipped.outside.length >= 3) {
        outsideAccumulator.push(clipped.outside);
      }
      if (clipped.inside.length >= 3) {
        nextRemaining.push(clipped.inside);
      }
    }
    return nextRemaining;
  }

  /**
   * Builds inward half-planes for each loop edge (inside toward loop center).
   *
   * @param loopVertices Loop vertices.
   * @param faceNormal Face normal for orientation.
   * @returns Inward planes.
   */
  private static buildInwardEdgePlanes(
    loopVertices: readonly THREE.Vector3[],
    faceNormal: THREE.Vector3,
  ): SolidPlane[] {
    const centroid = this.polygonCentroid(loopVertices);
    const planes: SolidPlane[] = [];
    const count = loopVertices.length;
    for (let index = 0; index < count; index++) {
      const start = loopVertices[index];
      const end = loopVertices[(index + 1) % count];
      if (!start || !end) {
        continue;
      }
      const plane = this.inwardPlaneForEdge(start, end, faceNormal, centroid);
      if (plane) {
        planes.push(plane);
      }
    }
    return planes;
  }

  /**
   * Builds one inward half-plane for a loop edge, or null when the edge is
   * degenerate.
   *
   * @param start Edge start.
   * @param end Edge end.
   * @param faceNormal Face normal.
   * @param centroid Loop centroid for inward orientation.
   * @returns Inward plane or null.
   */
  private static inwardPlaneForEdge(
    start: THREE.Vector3,
    end: THREE.Vector3,
    faceNormal: THREE.Vector3,
    centroid: THREE.Vector3,
  ): SolidPlane | null {
    const edge = scratchEdge.subVectors(end, start);
    if (edge.lengthSq() < 1e-16) {
      return null;
    }
    const normal = new THREE.Vector3().crossVectors(faceNormal, edge).normalize();
    if (normal.dot(scratchToCentroid.subVectors(centroid, start)) > 0) {
      normal.negate();
    }
    return new SolidPlane(normal, -normal.dot(start));
  }

  /**
   * Polygon centroid.
   *
   * @param polygon Vertices.
   * @returns Centroid.
   */
  private static polygonCentroid(polygon: readonly THREE.Vector3[]): THREE.Vector3 {
    const centroid = new THREE.Vector3();
    for (const vertex of polygon) {
      centroid.add(vertex);
    }
    return centroid.multiplyScalar(1 / polygon.length);
  }

  /**
   * Newell normal for a polygon.
   *
   * @param polygon Vertices.
   * @returns Unit normal.
   */
  private static polygonNormal(polygon: readonly THREE.Vector3[]): THREE.Vector3 {
    const normal = new THREE.Vector3();
    const count = polygon.length;
    for (let index = 0; index < count; index++) {
      const current = polygon[index];
      const next = polygon[(index + 1) % count];
      if (!current || !next) {
        continue;
      }
      normal.x += (current.y - next.y) * (current.z + next.z);
      normal.y += (current.z - next.z) * (current.x + next.x);
      normal.z += (current.x - next.x) * (current.y + next.y);
    }
    return normal.normalize();
  }
}
