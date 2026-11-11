import * as THREE from 'three';

/**
 * One vertex whose presence differs between the previous and current weld
 * table.
 */
interface SolidSurfaceReplayVertexBalance {
  point: THREE.Vector3;
  balance: number;
}

/**
 * Tracks which weld-table vertices differ between the previous compile of a
 * brush and the compile in progress, so faces far from every difference can be
 * replayed without changing any weld decision.
 */
export class SolidSurfaceReplayVertexDifference {
  private readonly balanceByKey = new Map<string, SolidSurfaceReplayVertexBalance>();
  private readonly activeBounds = new THREE.Box3();
  private activeCache: THREE.Vector3[] | null = null;

  /** Forgets every tracked difference. */
  clear(): void {
    this.balanceByKey.clear();
    this.activeCache = null;
  }

  /**
   * Records that a face inserted different vertices than it did previously.
   *
   * @param previousVertices Vertices the face inserted in the previous compile.
   * @param currentVertices Vertices the face inserted in this compile.
   */
  recordReplacement(previousVertices: readonly THREE.Vector3[], currentVertices: readonly THREE.Vector3[]): void {
    const start = this.commonPrefixLength(previousVertices, currentVertices);
    if (start === previousVertices.length && start === currentVertices.length) {
      return;
    }
    const end = this.commonSuffixLength(previousVertices, currentVertices, start);
    this.adjustBalances(previousVertices, start, previousVertices.length - end, -1);
    this.adjustBalances(currentVertices, start, currentVertices.length - end, 1);
  }

  /**
   * Returns whether any differing vertex lies inside the given bounds.
   *
   * @param bounds Query bounds.
   * @returns True when a difference could influence welds inside the bounds.
   */
  intersectsBounds(bounds: THREE.Box3): boolean {
    const active = this.activePoints();
    if (active.length === 0 || !bounds.intersectsBox(this.activeBounds)) {
      return false;
    }
    return active.some((point) => bounds.containsPoint(point));
  }

  /**
   * Returns whether any differing vertex lies within a reach of a weld query
   * result.
   *
   * @param queries Stored vertices the weld queries resolved to.
   * @param reach Distance within which a difference may change a query.
   * @returns True when a difference could change one of the queries.
   */
  touchesQueries(queries: readonly THREE.Vector3[], reach: number): boolean {
    const active = this.activePoints();
    if (active.length === 0) {
      return false;
    }
    const bounds = this.activeBounds;
    const sqrReach = reach * reach;
    for (const query of queries) {
      if (!this.nearBounds(bounds, query, reach)) continue;
      if (this.anyWithin(active, query, sqrReach)) return true;
    }
    return false;
  }

  /**
   * Returns whether a point lies within a distance of a box.
   *
   * @param bounds Box.
   * @param point Point.
   * @param reach Distance.
   * @returns True when the point is inside the box grown by the distance.
   */
  private nearBounds(bounds: THREE.Box3, point: THREE.Vector3, reach: number): boolean {
    return (
      point.x >= bounds.min.x - reach &&
      point.x <= bounds.max.x + reach &&
      point.y >= bounds.min.y - reach &&
      point.y <= bounds.max.y + reach &&
      point.z >= bounds.min.z - reach &&
      point.z <= bounds.max.z + reach
    );
  }

  /**
   * Returns the points whose balance is non-zero.
   *
   * @returns Differing points.
   */
  private activePoints(): THREE.Vector3[] {
    if (this.activeCache) {
      return this.activeCache;
    }
    const active: THREE.Vector3[] = [];
    this.activeBounds.makeEmpty();
    for (const entry of this.balanceByKey.values()) {
      if (entry.balance === 0) continue;
      active.push(entry.point);
      this.activeBounds.expandByPoint(entry.point);
    }
    this.activeCache = active;
    return active;
  }

  /**
   * Returns whether any point lies strictly within a squared distance of a
   * query point.
   *
   * @param points Candidate points.
   * @param query Query point.
   * @param sqrReach Squared distance limit.
   * @returns True when one point is close enough.
   */
  private anyWithin(points: readonly THREE.Vector3[], query: THREE.Vector3, sqrReach: number): boolean {
    for (const point of points) {
      if (point.distanceToSquared(query) < sqrReach) return true;
    }
    return false;
  }

  /**
   * Adds a signed count for each vertex of a list range.
   *
   * @param vertices Vertices to count.
   * @param start First index of the range.
   * @param end Index after the range.
   * @param delta Count change per vertex.
   */
  private adjustBalances(vertices: readonly THREE.Vector3[], start: number, end: number, delta: number): void {
    if (end > start) this.activeCache = null;
    for (let index = start; index < end; index++) {
      const point = vertices[index] as THREE.Vector3;
      const key = `${point.x},${point.y},${point.z}`;
      const entry = this.balanceByKey.get(key);
      if (entry) {
        entry.balance += delta;
      } else {
        this.balanceByKey.set(key, { point, balance: delta });
      }
    }
  }

  /**
   * Returns how many leading vertices two lists share exactly.
   *
   * @param first First list.
   * @param second Second list.
   * @returns Length of the common prefix.
   */
  private commonPrefixLength(first: readonly THREE.Vector3[], second: readonly THREE.Vector3[]): number {
    const limit = Math.min(first.length, second.length);
    let index = 0;
    while (index < limit && (first[index] as THREE.Vector3).equals(second[index] as THREE.Vector3)) index++;
    return index;
  }

  /**
   * Returns how many trailing vertices two lists share exactly, not reaching
   * into a common prefix.
   *
   * @param first First list.
   * @param second Second list.
   * @param prefix Length of the common prefix.
   * @returns Length of the common suffix.
   */
  private commonSuffixLength(
    first: readonly THREE.Vector3[],
    second: readonly THREE.Vector3[],
    prefix: number,
  ): number {
    const limit = Math.min(first.length, second.length) - prefix;
    let count = 0;
    while (
      count < limit &&
      (first[first.length - 1 - count] as THREE.Vector3).equals(second[second.length - 1 - count] as THREE.Vector3)
    ) {
      count++;
    }
    return count;
  }
}
