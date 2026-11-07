import * as THREE from 'three';
import {
  SOLID_SQR_VERTEX_EQUAL_EPSILON,
  SOLID_VERTEX_HASH_CELL_SIZE,
} from '@/solid/algorithm/math/solid_math_constants.js';

/** Multiplier that packs a y cell index above a z cell index in one key. */
const HASHED_VERTEX_PLANE_STRIDE = 2 ** 26;

/**
 * Welds nearly-identical vertices for solid CSG intermediate geometry using a
 * spatial hash.
 */
export class HashedVertexTable {
  private readonly vertices: THREE.Vector3[] = [];
  private readonly cellMap = new Map<number, Map<number, number[]>>();
  private readonly cellSize: number;
  private readonly sqrEqualEpsilon: number;

  /**
   * Creates a hashed vertex table.
   *
   * @param cellSize Spatial hash cell size (defaults to kCellSize).
   * @param sqrEqualEpsilon Squared distance threshold for welding.
   */
  constructor(
    cellSize: number = SOLID_VERTEX_HASH_CELL_SIZE,
    sqrEqualEpsilon: number = SOLID_SQR_VERTEX_EQUAL_EPSILON,
  ) {
    this.cellSize = cellSize;
    this.sqrEqualEpsilon = sqrEqualEpsilon;
  }

  /**
   * Inserts a point, returning the stable welded index of the closest match.
   *
   * @param point Point to insert.
   * @returns Index of the existing or newly created vertex.
   */
  add(point: THREE.Vector3): number {
    const closestIndex = this.findClosestIndex(point);
    if (closestIndex >= 0) {
      return closestIndex;
    }
    return this.insertNewVertex(point);
  }

  /**
   * Returns a clone of the welded position for a point (add + get).
   *
   * @param point Point to snap.
   * @returns Canonical welded position clone.
   */
  snap(point: THREE.Vector3): THREE.Vector3 {
    return this.get(this.add(point)).clone();
  }

  /** Clears all stored vertices and hash buckets. */
  clear(): void {
    this.vertices.length = 0;
    this.cellMap.clear();
  }

  /**
   * Returns the welded vertex list as clones.
   *
   * @returns Vertices in insertion order.
   */
  getVertices(): THREE.Vector3[] {
    return this.vertices.map((vertex) => vertex.clone());
  }

  /**
   * Returns the number of unique vertices.
   *
   * @returns Vertex count.
   */
  get count(): number {
    return this.vertices.length;
  }

  /**
   * Returns a vertex by index (shared table storage; do not mutate).
   *
   * @param index Vertex index.
   * @returns Vertex position.
   */
  get(index: number): THREE.Vector3 {
    return this.vertices[index]!;
  }

  /**
   * Finds the closest existing vertex within the equal-epsilon ball.
   *
   * @param point Query point.
   * @returns Closest index, or -1 when none match.
   */
  private findClosestIndex(point: THREE.Vector3): number {
    const candidates = this.gatherNearbyIndices(point);
    let closestIndex = -1;
    let closestDistance = this.sqrEqualEpsilon;
    for (const index of candidates) {
      const distance = this.vertices[index]!.distanceToSquared(point);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    }
    return closestIndex;
  }

  /**
   * Appends a new unique vertex into the table and spatial hash.
   *
   * @param point Point to store.
   * @returns New vertex index.
   */
  private insertNewVertex(point: THREE.Vector3): number {
    const newIndex = this.vertices.length;
    this.vertices.push(point.clone());
    this.storeIndexInCell(this.cellIndex(point.x), this.cellPlaneKey(point.y, point.z), newIndex);
    return newIndex;
  }

  /**
   * Builds the key of a cell inside one x slab from its y and z cell indices.
   * Keys are unique for cell indices within ±2^25 (about ±40 km at the default
   * cell size); beyond that two cells may share a bucket, which only adds
   * candidates that the distance test then rejects.
   *
   * @param cellY Y cell index.
   * @param cellZ Z cell index.
   * @returns Plane key.
   */
  private static planeKey(cellY: number, cellZ: number): number {
    return cellY * HASHED_VERTEX_PLANE_STRIDE + cellZ;
  }

  /**
   * Returns the plane key of the cell holding a y/z coordinate pair.
   *
   * @param y Y coordinate.
   * @param z Z coordinate.
   * @returns Plane key.
   */
  private cellPlaneKey(y: number, z: number): number {
    return HashedVertexTable.planeKey(this.cellIndex(y), this.cellIndex(z));
  }

  /**
   * Returns the cell index of one coordinate (toward-zero truncation).
   *
   * @param coordinate Coordinate.
   * @returns Cell index.
   */
  private cellIndex(coordinate: number): number {
    return Math.trunc(coordinate / this.cellSize);
  }

  /**
   * Returns the first and last cell index the equal-epsilon interval around a
   * coordinate touches. Cells outside it cannot hold a vertex close enough to
   * weld, so skipping them keeps the result of a full neighbor scan.
   *
   * @param coordinate Coordinate.
   * @returns First and last cell index.
   */
  private cellRange(coordinate: number): [number, number] {
    const reach = Math.sqrt(this.sqrEqualEpsilon);
    const low = Math.max(this.cellIndex(coordinate - reach), this.cellIndex(coordinate) - 1);
    const high = Math.min(this.cellIndex(coordinate + reach), this.cellIndex(coordinate) + 1);
    return [low, high];
  }

  /**
   * Collects candidate vertex indices from the cells the equal-epsilon ball
   * around a point touches, in ascending cell order.
   *
   * @param point Query point.
   * @returns Candidate indices.
   */
  private gatherNearbyIndices(point: THREE.Vector3): number[] {
    const [x0, x1] = this.cellRange(point.x);
    const [y0, y1] = this.cellRange(point.y);
    const [z0, z1] = this.cellRange(point.z);
    const result: number[] = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) this.appendCellBucket(result, x, HashedVertexTable.planeKey(y, z));
      }
    }
    return result;
  }

  /**
   * Appends one spatial-cell bucket into a candidate list.
   *
   * @param result Candidate index list.
   * @param cellX X cell index.
   * @param planeKey Y/z plane key.
   */
  private appendCellBucket(result: number[], cellX: number, planeKey: number): void {
    const bucket = this.cellMap.get(cellX)?.get(planeKey);
    if (bucket) {
      result.push(...bucket);
    }
  }

  /**
   * Stores an index in a spatial cell bucket.
   *
   * @param cellX X cell index.
   * @param planeKey Y/z plane key.
   * @param index Vertex index.
   */
  private storeIndexInCell(cellX: number, planeKey: number, index: number): void {
    let slab = this.cellMap.get(cellX);
    if (!slab) {
      slab = new Map();
      this.cellMap.set(cellX, slab);
    }
    const bucket = slab.get(planeKey);
    if (bucket) bucket.push(index);
    else slab.set(planeKey, [index]);
  }
}
