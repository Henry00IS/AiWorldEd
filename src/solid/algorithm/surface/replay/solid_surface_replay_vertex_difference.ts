import type * as THREE from 'three';

/** One vertex whose presence differs between the previous and current weld table. */
interface SolidSurfaceReplayVertexBalance {
  point: THREE.Vector3;
  balance: number;
}

/**
 * Tracks which weld-table vertices differ between the previous compile of a
 * brush and the compile in progress, so faces far from every difference can
 * be replayed without changing any weld decision.
 */
export class SolidSurfaceReplayVertexDifference {
  private readonly balanceByKey = new Map<string, SolidSurfaceReplayVertexBalance>();

  /** Forgets every tracked difference. */
  clear(): void {
    this.balanceByKey.clear();
  }

  /**
   * Records that a face inserted different vertices than it did previously.
   *
   * @param previousVertices Vertices the face inserted in the previous compile.
   * @param currentVertices Vertices the face inserted in this compile.
   */
  recordReplacement(previousVertices: readonly THREE.Vector3[], currentVertices: readonly THREE.Vector3[]): void {
    if (this.vertexListsEqual(previousVertices, currentVertices)) {
      return;
    }
    this.adjustBalances(previousVertices, -1);
    this.adjustBalances(currentVertices, 1);
  }

  /**
   * Returns whether any differing vertex lies inside the given bounds.
   *
   * @param bounds Query bounds.
   * @returns True when a difference could influence welds inside the bounds.
   */
  intersectsBounds(bounds: THREE.Box3): boolean {
    for (const entry of this.balanceByKey.values()) {
      if (entry.balance !== 0 && bounds.containsPoint(entry.point)) {
        return true;
      }
    }
    return false;
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
    const sqrReach = reach * reach;
    for (const query of queries) {
      if (this.anyWithin(active, query, sqrReach)) return true;
    }
    return false;
  }

  /**
   * Returns the points whose balance is non-zero.
   *
   * @returns Differing points.
   */
  private activePoints(): THREE.Vector3[] {
    const active: THREE.Vector3[] = [];
    for (const entry of this.balanceByKey.values()) {
      if (entry.balance !== 0) active.push(entry.point);
    }
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
   * Adds a signed count for each vertex of a list.
   *
   * @param vertices Vertices to count.
   * @param delta Count change per vertex.
   */
  private adjustBalances(vertices: readonly THREE.Vector3[], delta: number): void {
    for (const point of vertices) {
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
   * Returns whether two vertex lists hold exactly the same coordinates in the
   * same order.
   *
   * @param first First list.
   * @param second Second list.
   * @returns True when both lists are coordinate-identical.
   */
  private vertexListsEqual(first: readonly THREE.Vector3[], second: readonly THREE.Vector3[]): boolean {
    if (first.length !== second.length) {
      return false;
    }
    for (let index = 0; index < first.length; index++) {
      const firstPoint = first[index];
      const secondPoint = second[index];
      if (!firstPoint || !secondPoint || !firstPoint.equals(secondPoint)) {
        return false;
      }
    }
    return true;
  }
}
