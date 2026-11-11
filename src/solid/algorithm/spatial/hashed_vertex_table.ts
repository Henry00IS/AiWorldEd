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
 * Welds nearly-identical vertices for solid CSG intermediate geometry using a
 * spatial hash.
 */
export class HashedVertexTable {
  private readonly vertices: THREE.Vector3[] = [];
  private readonly cellX: number[] = [];
  private readonly cellY: number[] = [];
  private readonly cellZ: number[] = [];
  private readonly buckets = new Map<number, number[]>();
  private queryLog: THREE.Vector3[] | null = null;
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
   * Finds the closest existing vertex within the equal-epsilon ball, visiting
   * the touched cells in ascending x, y, z order so ties resolve to the first
   * candidate in that order.
   *
   * @param point Query point.
   * @returns Closest index, or -1 when none match.
   */
  private findClosestIndex(point: THREE.Vector3): number {
    const reach = Math.sqrt(this.sqrEqualEpsilon);
    const x0 = this.lowCell(point.x, reach),
      x1 = this.highCell(point.x, reach);
    const y0 = this.lowCell(point.y, reach),
      y1 = this.highCell(point.y, reach);
    const z0 = this.lowCell(point.z, reach),
      z1 = this.highCell(point.z, reach);
    const best = { index: -1, distance: this.sqrEqualEpsilon };
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          this.scanCell(x, y, z, point, best);
        }
      }
    }
    return best.index;
  }

  /**
   * Returns the lowest cell index the equal-epsilon ball around a coordinate
   * reaches, limited to one cell below the coordinate's own cell.
   *
   * @param coordinate Query coordinate.
   * @param reach Ball radius.
   * @returns Lowest cell index.
   */
  private lowCell(coordinate: number, reach: number): number {
    return Math.max(this.cellIndex(coordinate - reach), this.cellIndex(coordinate) - 1);
  }

  /**
   * Returns the highest cell index the equal-epsilon ball around a coordinate
   * reaches, limited to one cell above the coordinate's own cell.
   *
   * @param coordinate Query coordinate.
   * @param reach Ball radius.
   * @returns Highest cell index.
   */
  private highCell(coordinate: number, reach: number): number {
    return Math.min(this.cellIndex(coordinate + reach), this.cellIndex(coordinate) + 1);
  }

  /**
   * Tests every vertex stored in one cell against the query point and keeps the
   * strictly closest one. Bucket entries from other cells that share the hash
   * are skipped.
   *
   * @param x X cell index.
   * @param y Y cell index.
   * @param z Z cell index.
   * @param point Query point.
   * @param best Running closest index and squared distance, updated in place.
   */
  private scanCell(
    x: number,
    y: number,
    z: number,
    point: THREE.Vector3,
    best: { index: number; distance: number },
  ): void {
    const bucket = this.buckets.get(HashedVertexTable.cellHash(x, y, z));
    if (!bucket) return;
    for (const index of bucket) {
      if (this.cellX[index] !== x || this.cellY[index] !== y || this.cellZ[index] !== z) continue;
      const distance = this.vertices[index]?.distanceToSquared(point) ?? Infinity;
      if (distance < best.distance) {
        best.distance = distance;
        best.index = index;
      }
    }
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
    const key = HashedVertexTable.cellHash(x, y, z);
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
}
