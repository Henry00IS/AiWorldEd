import * as THREE from 'three';
import { SEAM_CORNER_ON_EDGE_DISTANCE } from './seam_constants.js';

/**
 * The corners that appeared or vanished in one refresh, used to find the
 * polygons whose edges may need different inserted corners. Queries scan a copy
 * of the corners sorted by x, built once after the last addition.
 */
export class SeamChangedCornerRegion {
  private readonly coordinates: number[] = [];
  private readonly bounds = new THREE.Box3();
  private readonly scratchPoint = new THREE.Vector3();
  private readonly scratchBox = new THREE.Box3();
  private sorted: Float64Array = new Float64Array(0);
  private sortedCount = -1;

  /** Forgets every recorded corner. */
  clear(): void {
    this.coordinates.length = 0;
    this.bounds.makeEmpty();
    this.sortedCount = -1;
  }

  /**
   * Records one changed corner.
   *
   * @param x Corner x.
   * @param y Corner y.
   * @param z Corner z.
   */
  add(x: number, y: number, z: number): void {
    this.coordinates.push(x, y, z);
    this.bounds.expandByPoint(this.scratchPoint.set(x, y, z));
  }

  /**
   * Bounds of every recorded corner.
   *
   * @returns Shared box, empty when nothing changed.
   */
  getBounds(): THREE.Box3 {
    return this.bounds;
  }

  /**
   * Whether no corner changed.
   *
   * @returns True when empty.
   */
  isEmpty(): boolean {
    return this.coordinates.length === 0;
  }

  /**
   * Whether any changed corner lies within tolerance of a box.
   *
   * @param box Box to test, typically a brush's corner bounds.
   * @returns True when some changed corner can touch an edge inside the box.
   */
  touchesBox(box: THREE.Box3): boolean {
    const reach = SEAM_CORNER_ON_EDGE_DISTANCE;
    if (!seamBoxesOverlap(this.bounds, box, reach)) return false;
    const sorted = this.sortedCorners();
    const count = sorted.length / 3;
    for (let index = this.firstAtOrAbove(box.min.x - reach); index < count; index++) {
      const offset = index * 3;
      if (sorted[offset]! > box.max.x + reach) return false;
      const y = sorted[offset + 1]!;
      const z = sorted[offset + 2]!;
      if (y < box.min.y - reach || y > box.max.y + reach) continue;
      if (z >= box.min.z - reach && z <= box.max.z + reach) return true;
    }
    return false;
  }

  /**
   * Whether any changed corner lies within tolerance of a polygon's bounds.
   *
   * @param vertices Polygon outline.
   * @returns True when some changed corner can touch one of its edges.
   */
  touchesOutline(vertices: readonly THREE.Vector3[]): boolean {
    if (this.coordinates.length === 0) return false;
    this.scratchBox.makeEmpty();
    for (const vertex of vertices) this.scratchBox.expandByPoint(vertex);
    return this.touchesBox(this.scratchBox);
  }

  /**
   * The recorded corners as x, y, z triples sorted by x, rebuilt only after new
   * additions.
   *
   * @returns Sorted flat coordinates.
   */
  private sortedCorners(): Float64Array {
    if (this.sortedCount === this.coordinates.length) return this.sorted;
    const coordinates = this.coordinates;
    const count = coordinates.length / 3;
    const keys = new Float64Array(count);
    for (let index = 0; index < count; index++) keys[index] = coordinates[index * 3]!;
    const order = new Uint32Array(count);
    for (let index = 0; index < count; index++) order[index] = index;
    order.sort((left, right) => keys[left]! - keys[right]!);
    this.sorted = new Float64Array(count * 3);
    for (let index = 0; index < count; index++) {
      const from = order[index]! * 3;
      this.sorted[index * 3] = coordinates[from]!;
      this.sorted[index * 3 + 1] = coordinates[from + 1]!;
      this.sorted[index * 3 + 2] = coordinates[from + 2]!;
    }
    this.sortedCount = coordinates.length;
    return this.sorted;
  }

  /**
   * Index of the first sorted corner whose x is at least a value.
   *
   * @param x Lower x bound.
   * @returns Corner index, the corner count when none qualifies.
   */
  private firstAtOrAbove(x: number): number {
    let low = 0;
    let high = this.sorted.length / 3;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (this.sorted[middle * 3]! < x) low = middle + 1;
      else high = middle;
    }
    return low;
  }
}

/**
 * Whether two boxes overlap once one is grown by a margin.
 *
 * @param first First box.
 * @param second Second box.
 * @param margin Growth margin.
 * @returns True on overlap.
 */
function seamBoxesOverlap(first: THREE.Box3, second: THREE.Box3, margin: number): boolean {
  if (first.isEmpty() || second.isEmpty()) return false;
  if (first.min.x > second.max.x + margin || first.max.x < second.min.x - margin) return false;
  if (first.min.y > second.max.y + margin || first.max.y < second.min.y - margin) return false;
  return first.min.z <= second.max.z + margin && first.max.z >= second.min.z - margin;
}
