import * as THREE from 'three';

const HULL_SCALE_EPSILON = 1e-12;

type DualHullFace = {
  a: number;
  b: number;
  c: number;
  outside: number[];
  alive: boolean;
};

type DualHullWork = {
  points: readonly THREE.Vector3[];
  faces: DualHullFace[];
  epsilon: number;
  interior: THREE.Vector3;
};

type DualHullEdge = {
  from: number;
  to: number;
};

/** Builds the triangle boundary of a point set. */
export class SolidDualHull {
  /**
   * Returns outward-facing triangles of the convex hull.
   *
   * @param points Points to enclose.
   * @returns Triangle index triples, or null when the points are flat.
   */
  static triangles(points: readonly THREE.Vector3[]): number[][] | null {
    const work = this.prepare(points);
    if (!work) return null;
    this.expand(work);
    return this.liveTriangles(work.faces);
  }

  /**
   * Seeds a tetrahedron and the points that still lie outside it.
   *
   * @param points Points to enclose.
   * @returns Hull state, or null when no tetrahedron exists.
   */
  private static prepare(points: readonly THREE.Vector3[]): DualHullWork | null {
    const seed = this.seedIndices(points);
    if (!seed) return null;
    const interior = this.centroid(points, seed);
    const work: DualHullWork = {
      points,
      faces: this.seedFaces(points, seed, interior),
      epsilon: this.outsideEpsilon(points),
      interior,
    };
    this.assignOutside(work, this.pendingIndices(points.length, seed));
    return work;
  }

  /**
   * Adds outside points until every point is inside the hull.
   *
   * @param work Hull state.
   */
  private static expand(work: DualHullWork): void {
    for (;;) {
      const next = this.furthestOutside(work);
      if (!next) return;
      this.addPoint(work, next.point);
    }
  }

  /**
   * Returns the indices of a non-flat tetrahedron.
   *
   * @param points Points to enclose.
   * @returns Four indices, or null when the set is flat.
   */
  private static seedIndices(points: readonly THREE.Vector3[]): number[] | null {
    const pair = this.widestPair(points);
    if (!pair) return null;
    const third = this.farthestFromSegment(points, pair[0], pair[1]);
    if (third === null) return null;
    const fourth = this.farthestFromFace(points, pair[0], pair[1], third);
    if (fourth === null) return null;
    return [pair[0], pair[1], third, fourth];
  }

  /**
   * Returns the pair with the greatest separation.
   *
   * @param points Points to search.
   * @returns Two indices, or null when every point coincides.
   */
  private static widestPair(points: readonly THREE.Vector3[]): [number, number] | null {
    let best = 0;
    let pair: [number, number] | null = null;
    for (let left = 0; left < points.length; left += 1) {
      for (let right = left + 1; right < points.length; right += 1) {
        const leftPoint = points[left];
        const rightPoint = points[right];
        if (!leftPoint || !rightPoint) continue;
        const distance = leftPoint.distanceToSquared(rightPoint);
        if (distance <= best) continue;
        best = distance;
        pair = [left, right];
      }
    }
    return pair;
  }

  /**
   * Returns the point farthest from a segment.
   *
   * @param points Points to search.
   * @param start Segment start index.
   * @param end Segment end index.
   * @returns Point index, or null when every point lies on the segment.
   */
  private static farthestFromSegment(points: readonly THREE.Vector3[], start: number, end: number): number | null {
    let best = HULL_SCALE_EPSILON;
    let chosen: number | null = null;
    for (let index = 0; index < points.length; index += 1) {
      const distance = this.segmentDistanceSquared(points, start, end, index);
      if (distance <= best) continue;
      best = distance;
      chosen = index;
    }
    return chosen;
  }

  /**
   * Returns the point farthest from a triangle.
   *
   * @param points Points to search.
   * @param first Triangle index.
   * @param second Triangle index.
   * @param third Triangle index.
   * @returns Point index, or null when every point lies on the plane.
   */
  private static farthestFromFace(
    points: readonly THREE.Vector3[],
    first: number,
    second: number,
    third: number,
  ): number | null {
    let best = HULL_SCALE_EPSILON;
    let chosen: number | null = null;
    for (let index = 0; index < points.length; index += 1) {
      const volume = Math.abs(this.signedVolume(points, first, second, third, index));
      if (volume <= best) continue;
      best = volume;
      chosen = index;
    }
    return chosen;
  }

  /**
   * Builds four outward faces of a tetrahedron.
   *
   * @param points Hull points.
   * @param seed Four tetrahedron indices.
   * @param interior A point inside the tetrahedron.
   * @returns Seed faces.
   */
  private static seedFaces(
    points: readonly THREE.Vector3[],
    seed: readonly number[],
    interior: THREE.Vector3,
  ): DualHullFace[] {
    const first = seed[0] ?? 0;
    const second = seed[1] ?? 0;
    const third = seed[2] ?? 0;
    const fourth = seed[3] ?? 0;
    return [
      this.outwardFace(points, first, second, third, interior),
      this.outwardFace(points, first, third, fourth, interior),
      this.outwardFace(points, first, fourth, second, interior),
      this.outwardFace(points, second, fourth, third, interior),
    ];
  }

  /**
   * Lists point indices that are not part of the seed.
   *
   * @param count Point count.
   * @param seed Seed indices.
   * @returns Remaining indices.
   */
  private static pendingIndices(count: number, seed: readonly number[]): number[] {
    const used = new Set(seed);
    const pending: number[] = [];
    for (let index = 0; index < count; index += 1) {
      if (!used.has(index)) pending.push(index);
    }
    return pending;
  }

  /**
   * Stores each pending point on the face it sticks out of the most.
   *
   * @param work Hull state.
   * @param pending Point indices still outside the seed.
   */
  private static assignOutside(work: DualHullWork, pending: readonly number[]): void {
    for (const point of pending)
      this.storeOutside(
        work,
        work.faces.map((_, index) => index),
        point,
      );
  }

  /**
   * Adds the furthest outside point and repairs the boundary.
   *
   * @param work Hull state.
   * @param point Point index.
   */
  private static addPoint(work: DualHullWork, point: number): void {
    const visible = this.visibleFaces(work, point);
    const horizon = this.horizonEdges(work.faces, visible);
    const pool = this.takeOutside(work.faces, visible, point);
    this.killFaces(work.faces, visible);
    const created = this.facesFromHorizon(work, horizon, point);
    for (const candidate of pool) this.storeOutside(work, created, candidate);
  }

  /**
   * Returns the outside point with the greatest distance, and its face.
   *
   * @param work Hull state.
   * @returns Face and point, or null when every point is inside.
   */
  private static furthestOutside(work: DualHullWork): { face: number; point: number } | null {
    let best = work.epsilon;
    let found: { face: number; point: number } | null = null;
    for (let face = 0; face < work.faces.length; face += 1) {
      found = this.furthestOnFace(work, face, best, found);
      const current = work.faces[face];
      if (current && found && found.face === face) best = this.faceDistance(work, face, found.point);
    }
    return found;
  }

  /**
   * Considers one face's outside points.
   *
   * @param work Hull state.
   * @param face Face index.
   * @param best Best distance so far.
   * @param found Best face and point so far.
   * @returns Updated best face and point.
   */
  private static furthestOnFace(
    work: DualHullWork,
    face: number,
    best: number,
    found: { face: number; point: number } | null,
  ): { face: number; point: number } | null {
    const record = work.faces[face];
    if (!record || !record.alive) return found;
    let next = found;
    let limit = best;
    for (const point of record.outside) {
      const distance = this.faceDistance(work, face, point);
      if (distance <= limit) continue;
      limit = distance;
      next = { face, point };
    }
    return next;
  }

  /**
   * Lists faces that see a point on their outside.
   *
   * @param work Hull state.
   * @param point Point index.
   * @returns Visible face indices.
   */
  private static visibleFaces(work: DualHullWork, point: number): number[] {
    const visible: number[] = [];
    for (let index = 0; index < work.faces.length; index += 1) {
      const face = work.faces[index];
      if (!face || !face.alive) continue;
      if (this.faceDistance(work, index, point) > work.epsilon) visible.push(index);
    }
    return visible;
  }

  /**
   * Returns boundary edges of a visible set, oriented with the visible face.
   *
   * @param faces All faces.
   * @param visible Visible face indices.
   * @returns Edges that belong to one visible face.
   */
  private static horizonEdges(faces: readonly DualHullFace[], visible: readonly number[]): DualHullEdge[] {
    const counts = new Map<string, { edge: DualHullEdge; count: number }>();
    for (const index of visible) {
      const face = faces[index];
      if (!face) continue;
      this.countEdge(counts, face.a, face.b);
      this.countEdge(counts, face.b, face.c);
      this.countEdge(counts, face.c, face.a);
    }
    const horizon: DualHullEdge[] = [];
    for (const entry of counts.values()) {
      if (entry.count === 1) horizon.push(entry.edge);
    }
    return horizon;
  }

  /**
   * Counts one directed edge, keeping the first direction.
   *
   * @param counts Edge counts.
   * @param from Edge start.
   * @param to Edge end.
   */
  private static countEdge(counts: Map<string, { edge: DualHullEdge; count: number }>, from: number, to: number): void {
    const key = from < to ? `${from}-${to}` : `${to}-${from}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    counts.set(key, { edge: { from, to }, count: 1 });
  }

  /**
   * Collects outside points of the visible faces, except the point being added.
   *
   * @param faces All faces.
   * @param visible Visible face indices.
   * @param point Point being added.
   * @returns Point indices to test against the new faces.
   */
  private static takeOutside(faces: readonly DualHullFace[], visible: readonly number[], point: number): number[] {
    const pool: number[] = [];
    for (const index of visible) {
      const face = faces[index];
      if (!face) continue;
      for (const candidate of face.outside) {
        if (candidate !== point) pool.push(candidate);
      }
    }
    return pool;
  }

  /**
   * Marks faces so they no longer bound the hull.
   *
   * @param faces All faces.
   * @param visible Visible face indices.
   */
  private static killFaces(faces: readonly DualHullFace[], visible: readonly number[]): void {
    for (const index of visible) {
      const face = faces[index];
      if (!face) continue;
      face.alive = false;
      face.outside = [];
    }
  }

  /**
   * Creates one outward face for each horizon edge.
   *
   * @param work Hull state.
   * @param horizon Horizon edges.
   * @param point New hull point.
   * @returns Indices of the created faces.
   */
  private static facesFromHorizon(work: DualHullWork, horizon: readonly DualHullEdge[], point: number): number[] {
    const created: number[] = [];
    for (const edge of horizon) {
      work.faces.push(this.outwardFace(work.points, edge.from, edge.to, point, work.interior));
      created.push(work.faces.length - 1);
    }
    return created;
  }

  /**
   * Stores a point on the listed face it sticks out of the most.
   *
   * @param work Hull state.
   * @param faceIndices Faces that may see the point.
   * @param point Point index.
   */
  private static storeOutside(work: DualHullWork, faceIndices: readonly number[], point: number): void {
    let bestFace = -1;
    let best = work.epsilon;
    for (const face of faceIndices) {
      const distance = this.faceDistance(work, face, point);
      if (distance <= best) continue;
      best = distance;
      bestFace = face;
    }
    const record = work.faces[bestFace];
    if (record) record.outside.push(point);
  }

  /**
   * Returns the signed volume of a face against a point.
   *
   * @param work Hull state.
   * @param face Face index.
   * @param point Point index.
   * @returns Positive when the point is outside an outward face.
   */
  private static faceDistance(work: DualHullWork, face: number, point: number): number {
    const record = work.faces[face];
    if (!record) return 0;
    return this.signedVolume(work.points, record.a, record.b, record.c, point);
  }

  /**
   * Builds a triangle whose outward side faces away from an interior point.
   *
   * @param points Hull points.
   * @param first First index.
   * @param second Second index.
   * @param third Third index.
   * @param interior Point that must lie inside the hull.
   * @returns Outward face.
   */
  private static outwardFace(
    points: readonly THREE.Vector3[],
    first: number,
    second: number,
    third: number,
    interior: THREE.Vector3,
  ): DualHullFace {
    if (this.volumeAgainst(points[first], points[second], points[third], interior) > 0) {
      return { a: first, b: third, c: second, outside: [], alive: true };
    }
    return { a: first, b: second, c: third, outside: [], alive: true };
  }

  /**
   * Returns alive triangles.
   *
   * @param faces All faces.
   * @returns Index triples.
   */
  private static liveTriangles(faces: readonly DualHullFace[]): number[][] {
    const triangles: number[][] = [];
    for (const face of faces) {
      if (!face.alive) continue;
      triangles.push([face.a, face.b, face.c]);
    }
    return triangles;
  }

  /**
   * Returns the average of four seed points.
   *
   * @param points Hull points.
   * @param seed Four indices.
   * @returns Interior point.
   */
  private static centroid(points: readonly THREE.Vector3[], seed: readonly number[]): THREE.Vector3 {
    const center = new THREE.Vector3();
    for (const index of seed) {
      const point = points[index];
      if (point) center.add(point);
    }
    return center.multiplyScalar(1 / seed.length);
  }

  /**
   * Returns a volume tolerance scaled to the point set.
   *
   * @param points Hull points.
   * @returns Outside epsilon.
   */
  private static outsideEpsilon(points: readonly THREE.Vector3[]): number {
    let scale = 1;
    for (const point of points) scale = Math.max(scale, Math.abs(point.x), Math.abs(point.y), Math.abs(point.z));
    return scale * scale * scale * HULL_SCALE_EPSILON;
  }

  /**
   * Returns the squared distance from a point to a segment.
   *
   * @param points Hull points.
   * @param start Segment start index.
   * @param end Segment end index.
   * @param point Point index.
   * @returns Squared distance.
   */
  private static segmentDistanceSquared(
    points: readonly THREE.Vector3[],
    start: number,
    end: number,
    point: number,
  ): number {
    const from = points[start];
    const to = points[end];
    const sample = points[point];
    if (!from || !to || !sample) return 0;
    return this.pointSegmentDistanceSquared(from, to, sample);
  }

  /**
   * Returns the squared distance from a position to a segment.
   *
   * @param start Segment start.
   * @param end Segment end.
   * @param point Sample position.
   * @returns Squared distance.
   */
  private static pointSegmentDistanceSquared(start: THREE.Vector3, end: THREE.Vector3, point: THREE.Vector3): number {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dy * dy + dz * dz;
    if (lengthSquared < HULL_SCALE_EPSILON) return point.distanceToSquared(start);
    const travel = ((point.x - start.x) * dx + (point.y - start.y) * dy + (point.z - start.z) * dz) / lengthSquared;
    const clamped = Math.max(0, Math.min(1, travel));
    const ox = start.x + dx * clamped - point.x;
    const oy = start.y + dy * clamped - point.y;
    const oz = start.z + dz * clamped - point.z;
    return ox * ox + oy * oy + oz * oz;
  }

  /**
   * Returns the signed volume of tetrahedron a-b-c-point.
   *
   * @param points Hull points.
   * @param first First index.
   * @param second Second index.
   * @param third Third index.
   * @param point Fourth index.
   * @returns Signed volume.
   */
  private static signedVolume(
    points: readonly THREE.Vector3[],
    first: number,
    second: number,
    third: number,
    point: number,
  ): number {
    return this.volumeAgainst(points[first], points[second], points[third], points[point]);
  }

  /**
   * Returns the signed volume of a triangle against a position.
   *
   * @param first First corner.
   * @param second Second corner.
   * @param third Third corner.
   * @param point Sample position.
   * @returns Signed volume, positive on the right-hand side.
   */
  private static volumeAgainst(
    first: THREE.Vector3 | undefined,
    second: THREE.Vector3 | undefined,
    third: THREE.Vector3 | undefined,
    point: THREE.Vector3 | undefined,
  ): number {
    if (!first || !second || !third || !point) return 0;
    const abx = second.x - first.x;
    const aby = second.y - first.y;
    const abz = second.z - first.z;
    const acx = third.x - first.x;
    const acy = third.y - first.y;
    const acz = third.z - first.z;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    return nx * (point.x - first.x) + ny * (point.y - first.y) + nz * (point.z - first.z);
  }
}
