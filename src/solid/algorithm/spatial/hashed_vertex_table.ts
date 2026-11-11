import * as THREE from 'three';
import {
  SOLID_SQR_VERTEX_EQUAL_EPSILON,
  SOLID_VERTEX_HASH_CELL_SIZE,
} from '@/solid/algorithm/math/solid_math_constants.js';

/** Odd multiplier mixing the x cell index into a bucket hash. */
const HASHED_VERTEX_MIX_X = 0x9e3779b1;
/** Odd multiplier mixing the y cell index into a bucket hash. */
const HASHED_VERTEX_MIX_Y = 0x85ebca77;
/** Odd multiplier mixing the z cell index into a bucket hash. */
const HASHED_VERTEX_MIX_Z = 0xc2b2ae3d;
/**
 * Bucket cells span this many weld cells per axis, so most queries probe one
 * bucket.
 */
const HASHED_VERTEX_BUCKET_SPAN = 4;

/**
 * Welds nearly-identical vertices for solid CSG intermediate geometry using a
 * spatial hash.
 */
export class HashedVertexTable {
  private readonly vertices: THREE.Vector3[] = [];
  private readonly cellX: number[] = [];
  private readonly cellY: number[] = [];
  private readonly cellZ: number[] = [];
  private readonly bucketX: number[] = [];
  private readonly bucketY: number[] = [];
  private readonly bucketZ: number[] = [];
  private readonly buckets = new Map<number, number[]>();
  private queryLog: THREE.Vector3[] | null = null;
  private readonly cellSize: number;
  private readonly bucketSize: number;
  private readonly sqrEqualEpsilon: number;
  private readonly reach: number;
  private bestIndex = -1;
  private bestDistance = 0;

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
    this.bucketSize = cellSize * HASHED_VERTEX_BUCKET_SPAN;
    this.sqrEqualEpsilon = sqrEqualEpsilon;
    this.reach = Math.sqrt(sqrEqualEpsilon);
  }

  /**
   * Inserts a point, returning the stable welded index of the closest match.
   *
   * @param point Point to insert.
   * @returns Index of the existing or newly created vertex.
   */
  add(point: THREE.Vector3): number {
    const closestIndex = this.findClosestIndex(point);
    const index = closestIndex >= 0 ? closestIndex : this.insertNewVertex(point);
    const stored = this.vertices[index];
    if (this.queryLog && stored) this.queryLog.push(stored);
    return index;
  }

  /**
   * Installs or removes a log that receives the stored vertex every {@link add}
   * call resolves to, in call order.
   *
   * @param log Array to append to, or null to stop logging.
   */
  setQueryLog(log: THREE.Vector3[] | null): void {
    this.queryLog = log;
  }

  /**
   * Welds a point and returns the stored vertex itself rather than a copy.
   * Callers must treat the returned vector as read-only.
   *
   * @param point Point to weld.
   * @returns Stored welded vertex (shared, not copied).
   */
  weldShared(point: THREE.Vector3): THREE.Vector3 {
    return this.get(this.add(point));
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

  /**
   * Appends vertices without welding them against existing entries. Callers
   * must only pass vertices known to be farther than the equal epsilon from
   * every stored vertex.
   *
   * @param points Vertices to append in order.
   */
  appendUnwelded(points: readonly THREE.Vector3[]): void {
    for (const point of points) {
      this.insertNewVertex(point);
    }
  }

  /**
   * Returns the stored vertices from a given index to the end, in insertion
   * order.
   *
   * @param startIndex First index to include.
   * @returns Stored vertex objects (not copies).
   */
  verticesFrom(startIndex: number): THREE.Vector3[] {
    return this.vertices.slice(startIndex);
  }

  /** Clears all stored vertices and hash buckets. */
  clear(): void {
    this.vertices.length = 0;
    this.cellX.length = 0;
    this.cellY.length = 0;
    this.cellZ.length = 0;
    this.bucketX.length = 0;
    this.bucketY.length = 0;
    this.bucketZ.length = 0;
    this.buckets.clear();
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
   * Finds the closest existing vertex within the equal-epsilon ball. Among
   * equally close vertices the one in the lowest weld cell (by x, then y, then
   * z) wins, then the earliest inserted.
   *
   * @param point Query point.
   * @returns Closest index, or -1 when none match.
   */
  private findClosestIndex(point: THREE.Vector3): number {
    const reach = this.reach;
    const x0 = this.bucketIndex(point.x - reach),
      x1 = this.bucketIndex(point.x + reach);
    const y0 = this.bucketIndex(point.y - reach),
      y1 = this.bucketIndex(point.y + reach);
    const z0 = this.bucketIndex(point.z - reach),
      z1 = this.bucketIndex(point.z + reach);
    this.bestIndex = -1;
    this.bestDistance = this.sqrEqualEpsilon;
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          this.scanBucket(x, y, z, point);
        }
      }
    }
    return this.bestIndex;
  }

  /**
   * Tests every vertex stored in one bucket cell against the query point and
   * keeps the closest one. Entries of other cells sharing the hash are
   * skipped.
   *
   * @param x X bucket index.
   * @param y Y bucket index.
   * @param z Z bucket index.
   * @param point Query point.
   */
  private scanBucket(x: number, y: number, z: number, point: THREE.Vector3): void {
    const bucket = this.buckets.get(HashedVertexTable.cellHash(x, y, z));
    if (!bucket) return;
    for (const index of bucket) {
      if (this.bucketX[index] !== x || this.bucketY[index] !== y || this.bucketZ[index] !== z) continue;
      const distance = (this.vertices[index] as THREE.Vector3).distanceToSquared(point);
      if (distance < this.bestDistance || (distance === this.bestDistance && this.winsTie(index))) {
        this.bestDistance = distance;
        this.bestIndex = index;
      }
    }
  }

  /**
   * Returns whether a candidate as close as the current best should replace it:
   * it lies in a lower weld cell, or in the same cell and was inserted
   * earlier.
   *
   * @param index Candidate index.
   * @returns True when the candidate wins the tie.
   */
  private winsTie(index: number): boolean {
    const best = this.bestIndex;
    if (best < 0) return false;
    const dx = (this.cellX[index] as number) - (this.cellX[best] as number);
    if (dx !== 0) return dx < 0;
    const dy = (this.cellY[index] as number) - (this.cellY[best] as number);
    if (dy !== 0) return dy < 0;
    const dz = (this.cellZ[index] as number) - (this.cellZ[best] as number);
    return dz !== 0 ? dz < 0 : index < best;
  }

  /**
   * Appends a new unique vertex into the table and spatial hash.
   *
   * @param point Point to store.
   * @returns New vertex index.
   */
  private insertNewVertex(point: THREE.Vector3): number {
    const newIndex = this.vertices.length;
    const x = this.cellIndex(point.x),
      y = this.cellIndex(point.y),
      z = this.cellIndex(point.z);
    this.vertices.push(point.clone());
    this.cellX.push(x);
    this.cellY.push(y);
    this.cellZ.push(z);
    const bx = this.bucketIndex(point.x),
      by = this.bucketIndex(point.y),
      bz = this.bucketIndex(point.z);
    this.bucketX.push(bx);
    this.bucketY.push(by);
    this.bucketZ.push(bz);
    const key = HashedVertexTable.cellHash(bx, by, bz);
    const bucket = this.buckets.get(key);
    if (bucket) bucket.push(newIndex);
    else this.buckets.set(key, [newIndex]);
    return newIndex;
  }

  /**
   * Mixes three cell indices into a 32-bit bucket key. Distinct cells may share
   * a key; lookups filter candidates by their stored cell indices.
   *
   * @param x X cell index.
   * @param y Y cell index.
   * @param z Z cell index.
   * @returns Bucket key.
   */
  private static cellHash(x: number, y: number, z: number): number {
    return (
      Math.imul(x | 0, HASHED_VERTEX_MIX_X) ^
      Math.imul(y | 0, HASHED_VERTEX_MIX_Y) ^
      Math.imul(z | 0, HASHED_VERTEX_MIX_Z)
    );
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
   * Returns the bucket cell index of one coordinate.
   *
   * @param coordinate Coordinate.
   * @returns Bucket cell index.
   */
  private bucketIndex(coordinate: number): number {
    return Math.floor(coordinate / this.bucketSize);
  }
}
