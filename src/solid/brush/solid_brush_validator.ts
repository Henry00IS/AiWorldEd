import { SolidBrush } from './solid_brush.js';
import { SOLID_FAT_PLANE_EPSILON, SOLID_NORMAL_ALIGN_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import {
  detectTopologyCoincidentClusters,
  type TopologyCoincidentCluster,
} from '@/edit/topology/topology_coincident.js';

const OUTWARD_NORMAL_SORT_AXIS_LENGTH = Math.hypot(1, 2, 3);
const OUTWARD_NORMAL_SORT_AXIS_X = 1 / OUTWARD_NORMAL_SORT_AXIS_LENGTH;
const OUTWARD_NORMAL_SORT_AXIS_Y = 2 / OUTWARD_NORMAL_SORT_AXIS_LENGTH;
const OUTWARD_NORMAL_SORT_AXIS_Z = 3 / OUTWARD_NORMAL_SORT_AXIS_LENGTH;
const ALIGNED_NORMAL_CHORD_SLACK = 1e-8;

/** Validation result for a solid brush manifold. */
export interface SolidBrushValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validates wing-edge topology, unique outward normals, distinct vertex
 * positions, and convexity assumptions for a solid brush.
 */
export class SolidBrushValidator {
  /**
   * Validates topology, twin links, unique outward normals, distinct vertex
   * positions, plane coverage, and vertex half-spaces.
   *
   * @param brush Brush to validate.
   * @returns Validation result with zero or more error messages.
   */
  static validate(brush: SolidBrush): SolidBrushValidation {
    const errors: string[] = [];
    this.checkArrayConsistency(brush, errors);
    if (errors.length > 0) return { valid: false, errors };
    this.checkTwinPairs(brush, errors);
    this.checkFaceRanges(brush, errors);
    this.checkDuplicateCoplanarFaces(brush, errors);
    this.checkVertexInsidePlanes(brush, errors);
    this.checkMinimumFaceSize(brush, errors);
    this.checkCoincidentVertices(brush, errors);
    return { valid: errors.length === 0, errors };
  }

  /**
   * Ensures core arrays have matching lengths and non-empty topology.
   *
   * @param brush Brush under test.
   * @param errors Accumulator for error strings.
   */
  private static checkArrayConsistency(brush: SolidBrush, errors: string[]): void {
    if (brush.vertices.length < 4) {
      errors.push('Brush must have at least 4 vertices');
    }
    if (brush.faces.length < 4) {
      errors.push('Brush must have at least 4 faces');
    }
    if (brush.wingEdges.length !== brush.edgeFaceIndices.length) {
      errors.push('Wing edge count must match edge-face index count');
    }
    if (brush.planes.length !== brush.faces.length) {
      errors.push('Plane count must match face count');
    }
  }

  /**
   * Ensures every wing edge has a mutual twin.
   *
   * @param brush Brush under test.
   * @param errors Accumulator for error strings.
   */
  private static checkTwinPairs(brush: SolidBrush, errors: string[]): void {
    for (let edgeIndex = 0; edgeIndex < brush.wingEdges.length; edgeIndex++) {
      const twinIndex = brush.wingEdges[edgeIndex]!.twinIndex;
      if (twinIndex < 0 || twinIndex >= brush.wingEdges.length) {
        errors.push(`Edge ${edgeIndex} has invalid twin index`);
        continue;
      }
      if (brush.wingEdges[twinIndex]!.twinIndex !== edgeIndex) {
        errors.push(`Edge ${edgeIndex} twin is not mutual`);
      }
      if (twinIndex === edgeIndex) {
        errors.push(`Edge ${edgeIndex} is twin of itself`);
      }
    }
  }

  /**
   * Ensures face edge ranges stay within the wing-edge array.
   *
   * @param brush Brush under test.
   * @param errors Accumulator for error strings.
   */
  private static checkFaceRanges(brush: SolidBrush, errors: string[]): void {
    for (let faceIndex = 0; faceIndex < brush.faces.length; faceIndex++) {
      const face = brush.faces[faceIndex]!;
      if (face.edgeCount < 3) {
        errors.push(`Face ${faceIndex} has fewer than 3 edges`);
      }
      const last = face.firstEdge + face.edgeCount;
      if (face.firstEdge < 0 || last > brush.wingEdges.length) {
        errors.push(`Face ${faceIndex} edge range is out of bounds`);
      }
    }
  }

  /**
   * Ensures every vertex lies on the inside of every face plane (convex solid).
   *
   * @param brush Brush under test.
   * @param errors Accumulator for error strings.
   */
  private static checkVertexInsidePlanes(brush: SolidBrush, errors: string[]): void {
    for (let vertexIndex = 0; vertexIndex < brush.vertices.length; vertexIndex++) {
      const vertex = brush.vertices[vertexIndex]!;
      for (let planeIndex = 0; planeIndex < brush.planes.length; planeIndex++) {
        const distance = brush.planes[planeIndex]!.signedDistance(vertex);
        if (distance > SOLID_FAT_PLANE_EPSILON) {
          errors.push(`Vertex ${vertexIndex} is outside plane ${planeIndex}`);
        }
      }
    }
  }

  /**
   * Ensures faces are at least triangles.
   *
   * @param brush Brush under test.
   * @param errors Accumulator for error strings.
   */
  private static checkMinimumFaceSize(brush: SolidBrush, errors: string[]): void {
    for (const face of brush.faces) {
      if (face.edgeCount < 3) {
        errors.push('Face edge count must be at least 3');
      }
    }
  }

  /**
   * Rejects a second face that repeats another face's outward normal.
   *
   * @param brush Brush under test.
   * @param errors Accumulator for error strings.
   */
  private static checkDuplicateCoplanarFaces(brush: SolidBrush, errors: string[]): void {
    const keys = this.buildOutwardNormalSortKeys(brush);
    const order = this.planeOrderBySortKey(keys);
    const chordLimit = this.alignedNormalChordLimit();
    this.scanSortedNormalsForDuplicate(brush, keys, order, chordLimit, errors);
  }

  /**
   * Projects each face normal onto the fixed sort axis.
   *
   * @param brush Brush under test.
   * @returns One sort key per plane, in plane order.
   */
  private static buildOutwardNormalSortKeys(brush: SolidBrush): number[] {
    const keys: number[] = [];
    for (const plane of brush.planes) {
      keys.push(this.outwardNormalSortKey(plane.normal));
    }
    return keys;
  }

  /**
   * Projects one unit normal onto the fixed sort axis.
   *
   * @param normal Face outward normal.
   * @returns Scalar sort key.
   */
  private static outwardNormalSortKey(normal: { x: number; y: number; z: number }): number {
    const weightedX = normal.x * OUTWARD_NORMAL_SORT_AXIS_X;
    const weightedY = normal.y * OUTWARD_NORMAL_SORT_AXIS_Y;
    const weightedZ = normal.z * OUTWARD_NORMAL_SORT_AXIS_Z;
    return weightedX + weightedY + weightedZ;
  }

  /**
   * Returns plane indices sorted by ascending normal sort key.
   *
   * @param keys Sort keys in plane order.
   * @returns Plane indices.
   */
  private static planeOrderBySortKey(keys: readonly number[]): number[] {
    const order = keys.map((_, index) => index);
    order.sort((left, right) => this.readSortKey(keys, left) - this.readSortKey(keys, right));
    return order;
  }

  /**
   * Returns the maximum sort-key gap that can still meet the align dot test.
   *
   * @returns Chord length plus a rounding slack.
   */
  private static alignedNormalChordLimit(): number {
    const separatedNormalChord = Math.sqrt(2 * (1 - SOLID_NORMAL_ALIGN_EPSILON));
    return separatedNormalChord + ALIGNED_NORMAL_CHORD_SLACK;
  }

  /**
   * Scans the sorted window and records the first repeated outward normal.
   *
   * @param brush Brush under test.
   * @param keys Sort keys in plane order.
   * @param order Plane indices sorted by key.
   * @param chordLimit Maximum key gap that can still be the same normal.
   * @param errors Accumulator for error strings.
   */
  private static scanSortedNormalsForDuplicate(
    brush: SolidBrush,
    keys: readonly number[],
    order: readonly number[],
    chordLimit: number,
    errors: string[],
  ): void {
    for (let left = 0; left < order.length; left++) {
      if (this.scanWindowForDuplicateNormal(brush, keys, order, left, chordLimit, errors)) {
        return;
      }
    }
  }

  /**
   * Compares one sorted plane with later planes inside the chord window.
   *
   * @param brush Brush under test.
   * @param keys Sort keys in plane order.
   * @param order Plane indices sorted by key.
   * @param left Position in the sorted order.
   * @param chordLimit Maximum key gap that can still be the same normal.
   * @param errors Accumulator for error strings.
   * @returns True when a duplicate was recorded.
   */
  private static scanWindowForDuplicateNormal(
    brush: SolidBrush,
    keys: readonly number[],
    order: readonly number[],
    left: number,
    chordLimit: number,
    errors: string[],
  ): boolean {
    const leftIndex = this.readSortedPlaneIndex(order, left);
    const leftKey = this.readSortKey(keys, leftIndex);
    for (let right = left + 1; right < order.length; right++) {
      if (this.sortKeyGapExceedsChord(keys, order, right, leftKey, chordLimit)) {
        return false;
      }
      if (this.recordMatchingOutwardNormal(brush, order, leftIndex, right, errors)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Reads a plane index from the sorted order, or a negative index when
   * missing.
   *
   * @param order Plane indices sorted by key.
   * @param position Position in the sorted order.
   * @returns Plane index, or -1 when the position is empty.
   */
  private static readSortedPlaneIndex(order: readonly number[], position: number): number {
    const planeIndex = order[position];
    if (planeIndex === undefined) {
      return -1;
    }
    return planeIndex;
  }

  /**
   * Reads a sort key, or zero when the index is missing.
   *
   * @param keys Sort keys in plane order.
   * @param planeIndex Plane index.
   * @returns Sort key.
   */
  private static readSortKey(keys: readonly number[], planeIndex: number): number {
    const key = keys[planeIndex];
    if (key === undefined) {
      return 0;
    }
    return key;
  }

  /**
   * Returns whether a later sort key lies beyond the chord window.
   *
   * @param keys Sort keys in plane order.
   * @param order Plane indices sorted by key.
   * @param right Position in the sorted order.
   * @param leftKey Sort key of the window start.
   * @param chordLimit Maximum key gap that can still be the same normal.
   * @returns True when the pair cannot share a normal.
   */
  private static sortKeyGapExceedsChord(
    keys: readonly number[],
    order: readonly number[],
    right: number,
    leftKey: number,
    chordLimit: number,
  ): boolean {
    const rightIndex = this.readSortedPlaneIndex(order, right);
    return this.readSortKey(keys, rightIndex) - leftKey > chordLimit;
  }

  /**
   * Records an error when two faces share an outward normal.
   *
   * @param brush Brush under test.
   * @param order Plane indices sorted by key.
   * @param leftIndex First plane index.
   * @param right Position of the second plane in the sorted order.
   * @param errors Accumulator for error strings.
   * @returns True when a duplicate was recorded.
   */
  private static recordMatchingOutwardNormal(
    brush: SolidBrush,
    order: readonly number[],
    leftIndex: number,
    right: number,
    errors: string[],
  ): boolean {
    const rightIndex = this.readSortedPlaneIndex(order, right);
    if (!this.outwardNormalsMatch(brush, leftIndex, rightIndex)) {
      return false;
    }
    errors.push(`Faces ${leftIndex} and ${rightIndex} share an outward normal`);
    return true;
  }

  /**
   * Returns whether two face normals point in the same direction.
   *
   * @param brush Brush under test.
   * @param leftIndex First plane index.
   * @param rightIndex Second plane index.
   * @returns True when the normals meet the align epsilon.
   */
  private static outwardNormalsMatch(brush: SolidBrush, leftIndex: number, rightIndex: number): boolean {
    const leftPlane = brush.planes[leftIndex];
    const rightPlane = brush.planes[rightIndex];
    if (!leftPlane || !rightPlane) {
      return false;
    }
    return leftPlane.normal.dot(rightPlane.normal) >= SOLID_NORMAL_ALIGN_EPSILON;
  }

  /**
   * Rejects a brush that has two distinct vertices at the same position.
   *
   * @param brush Brush under test.
   * @param errors Accumulator for error strings.
   */
  private static checkCoincidentVertices(brush: SolidBrush, errors: string[]): void {
    const clusters = detectTopologyCoincidentClusters({
      positions: brush.vertices,
      faces: [],
    });
    const firstCluster = this.readFirstCoincidentCluster(clusters);
    if (!firstCluster) {
      return;
    }
    this.recordCoincidentVertexPair(firstCluster.vertexIndices, errors);
  }

  /**
   * Returns the first coincident cluster when one exists.
   *
   * @param clusters Clusters from the position detector.
   * @returns First cluster, or null when every vertex is distinct.
   */
  private static readFirstCoincidentCluster(
    clusters: readonly TopologyCoincidentCluster[],
  ): TopologyCoincidentCluster | null {
    const firstCluster = clusters[0];
    if (!firstCluster) {
      return null;
    }
    return firstCluster;
  }

  /**
   * Records the first two vertices that share a position.
   *
   * @param vertexIndices Indices in one coincident cluster.
   * @param errors Accumulator for error strings.
   */
  private static recordCoincidentVertexPair(vertexIndices: readonly number[], errors: string[]): void {
    const firstIndex = vertexIndices[0];
    const secondIndex = vertexIndices[1];
    if (firstIndex === undefined || secondIndex === undefined) {
      return;
    }
    errors.push(`Vertices ${firstIndex} and ${secondIndex} share a position`);
  }
}
