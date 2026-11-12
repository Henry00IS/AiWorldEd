import * as THREE from 'three';
import { SeamCornerGrid } from './seam_corner_grid.js';
import { SEAM_CORNER_MAXIMUM_SLOPE, SEAM_CORNER_ON_EDGE_DISTANCE } from './seam_constants.js';

/**
 * Finds the registered corners that lie inside one polygon edge, ordered from
 * the edge start to its end.
 */
export class SeamEdgeCornerCollector {
  private readonly tolerance: number;
  private readonly found: number[] = [];
  private startX = 0;
  private startY = 0;
  private startZ = 0;
  private directionX = 0;
  private directionY = 0;
  private directionZ = 0;
  private edgeLength = 0;
  private ownVertices: readonly THREE.Vector3[] = [];
  private readonly acceptCorner = (x: number, y: number, z: number): void => this.considerCorner(x, y, z);

  /**
   * Creates a collector reading corners from a grid.
   *
   * @param grid Corner grid to query.
   * @param tolerance Largest distance from the edge a corner may have.
   */
  constructor(
    private readonly grid: SeamCornerGrid,
    tolerance: number = SEAM_CORNER_ON_EDGE_DISTANCE,
  ) {
    this.tolerance = tolerance;
  }

  /**
   * Returns the corners strictly inside the edge from start to end, sorted
   * along it, with corners closer than the tolerance to an earlier one left
   * out.
   *
   * @param start Edge start.
   * @param end Edge end.
   * @param ownVertices Vertices of the polygon the edge belongs to; they are
   *   never inserted into its own edges.
   * @returns New vertices to insert between start and end (empty when none).
   */
  collect(start: THREE.Vector3, end: THREE.Vector3, ownVertices: readonly THREE.Vector3[]): THREE.Vector3[] {
    if (!this.beginEdge(start, end)) return [];
    this.ownVertices = ownVertices;
    this.found.length = 0;
    this.grid.visitCornersAlongSegment(start.x, start.y, start.z, end.x, end.y, end.z, this.acceptCorner);
    if (this.found.length === 0) return [];
    return this.orderedDistinctCorners();
  }

  /**
   * Stores the edge frame for the corner tests.
   *
   * @param start Edge start.
   * @param end Edge end.
   * @returns False when the edge is too short to take a corner.
   */
  private beginEdge(start: THREE.Vector3, end: THREE.Vector3): boolean {
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const deltaZ = end.z - start.z;
    const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
    if (!(length > this.tolerance * 2)) return false;
    this.startX = start.x;
    this.startY = start.y;
    this.startZ = start.z;
    this.directionX = deltaX / length;
    this.directionY = deltaY / length;
    this.directionZ = deltaZ / length;
    this.edgeLength = length;
    return true;
  }

  /**
   * Keeps a corner when it lies inside the current edge.
   *
   * @param x Corner x.
   * @param y Corner y.
   * @param z Corner z.
   */
  private considerCorner(x: number, y: number, z: number): void {
    const offsetX = x - this.startX;
    const offsetY = y - this.startY;
    const offsetZ = z - this.startZ;
    const along = offsetX * this.directionX + offsetY * this.directionY + offsetZ * this.directionZ;
    if (along <= this.tolerance || along >= this.edgeLength - this.tolerance) return;
    const awayX = offsetX - this.directionX * along;
    const awayY = offsetY - this.directionY * along;
    const awayZ = offsetZ - this.directionZ * along;
    const awaySquared = awayX * awayX + awayY * awayY + awayZ * awayZ;
    if (awaySquared > this.tolerance * this.tolerance) return;
    const slopeReach = Math.min(along, this.edgeLength - along) * SEAM_CORNER_MAXIMUM_SLOPE;
    if (awaySquared > slopeReach * slopeReach) return;
    if (this.isOwnVertex(x, y, z)) return;
    this.found.push(along, x, y, z);
  }

  /**
   * Whether a corner is one of the current polygon's own vertices.
   *
   * @param x Corner x.
   * @param y Corner y.
   * @param z Corner z.
   * @returns True when it coincides exactly with an own vertex.
   */
  private isOwnVertex(x: number, y: number, z: number): boolean {
    for (const vertex of this.ownVertices) {
      if (vertex.x === x && vertex.y === y && vertex.z === z) return true;
    }
    return false;
  }

  /**
   * Sorts the found corners along the edge and drops near-duplicates.
   *
   * @returns Distinct corners as new vectors.
   */
  private orderedDistinctCorners(): THREE.Vector3[] {
    const order = this.sortedFoundIndices();
    const result: THREE.Vector3[] = [];
    let lastAlong = -Infinity;
    for (const index of order) {
      const along = this.found[index]!;
      if (along - lastAlong <= this.tolerance) continue;
      lastAlong = along;
      result.push(new THREE.Vector3(this.found[index + 1]!, this.found[index + 2]!, this.found[index + 3]!));
    }
    return result;
  }

  /**
   * Orders found entries by distance along the edge, then by position so the
   * order never depends on how the grid was filled.
   *
   * @returns Entry offsets into the found list.
   */
  private sortedFoundIndices(): number[] {
    const found = this.found;
    const offsets: number[] = [];
    for (let offset = 0; offset < found.length; offset += 4) offsets.push(offset);
    offsets.sort(
      (left, right) =>
        found[left]! - found[right]! ||
        found[left + 1]! - found[right + 1]! ||
        found[left + 2]! - found[right + 2]! ||
        found[left + 3]! - found[right + 3]!,
    );
    return offsets;
  }
}
