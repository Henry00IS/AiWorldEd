/**
 * Ear-clip triangulation for simple planar polygons (mesh display / OBJ
 * import). Preserves input loop winding (no forced 2D CCW reverse that inverts
 * faces). Fan triangulation incorrectly fills concave notches on n-gons.
 */

/** One 2D projected polygon vertex with its original loop index. */
interface ProjectedPolygonVertex {
  loopIndex: number;
  x: number;
  y: number;
}

/**
 * Triangulates a simple polygon given in 3D. Returns flat triples of indices
 * into the input point list (loop order). Empty when the face is unusable.
 * Output winding matches the input loop winding.
 *
 * @param points Ordered face corners in world/object space (at least 3).
 * @returns Triangle corner indices into {@code points}.
 */
export function triangulateSimplePolygon3d(points: ReadonlyArray<{ x: number; y: number; z: number }>): number[] {
  if (points.length < 3) {
    return [];
  }
  const shortPolygon = triangulateShortPolygon(points);
  if (shortPolygon) {
    return shortPolygon;
  }
  const projected = projectPolygonTo2d(points);
  if (projected.length < 3) {
    return [];
  }
  const orientation = Math.sign(signedArea2d(projected));
  if (orientation === 0) {
    return [];
  }
  return earClipProjectedPolygon(projected, orientation, points);
}

/**
 * Triangulates a triangle or a convex quad without an ear search.
 *
 * @param points Ordered face corners.
 * @returns Triangle indices, an empty list when a triangle is degenerate, or
 *   null when the polygon needs the general ear clip.
 */
function triangulateShortPolygon(points: ReadonlyArray<{ x: number; y: number; z: number }>): number[] | null {
  if (points.length === 3) {
    return triangulateSingleTriangle(points);
  }
  if (points.length === 4) {
    return triangulateConvexQuad(points);
  }
  return null;
}

/**
 * Returns the only triangle for a three-corner loop.
 *
 * @param points Three corners.
 * @returns `[0, 1, 2]`, or empty when the area is zero.
 */
function triangulateSingleTriangle(points: ReadonlyArray<{ x: number; y: number; z: number }>): number[] {
  return isTriangleAreaPositive3d(points[0]!, points[1]!, points[2]!) ? [0, 1, 2] : [];
}

/**
 * Splits a convex quad into two triangles that keep the input winding.
 *
 * @param points Four corners.
 * @returns Six indices, or null when a corner turn reverses.
 */
function triangulateConvexQuad(points: ReadonlyArray<{ x: number; y: number; z: number }>): number[] | null {
  const reference = cornerTurn(points, 0);
  if (!quadTurnsMatch(points, reference)) {
    return null;
  }
  return [0, 1, 2, 0, 2, 3];
}

/**
 * Returns whether every quad corner turns with the first corner.
 *
 * @param points Four corners.
 * @param reference Turn at the first corner.
 * @returns True when the quad is convex and consistently wound.
 */
function quadTurnsMatch(points: ReadonlyArray<{ x: number; y: number; z: number }>, reference: AxisVector): boolean {
  if (dotAxes(reference, reference) <= 1e-20) {
    return false;
  }
  for (let corner = 1; corner < 4; corner++) {
    if (dotAxes(cornerTurn(points, corner), reference) <= 1e-20) {
      return false;
    }
  }
  return true;
}

/**
 * Returns the turn at one quad corner.
 *
 * @param points Four corners.
 * @param cornerIndex Corner index.
 * @returns Cross product of the incoming and outgoing edges.
 */
function cornerTurn(points: ReadonlyArray<{ x: number; y: number; z: number }>, cornerIndex: number): AxisVector {
  const previous = points[(cornerIndex + 3) % 4]!;
  const current = points[cornerIndex]!;
  const next = points[(cornerIndex + 1) % 4]!;
  return crossAxes(edgeBetween(previous, current), edgeBetween(current, next));
}

/**
 * Returns the vector from one point to the next.
 *
 * @param from Start point.
 * @param to End point.
 * @returns Edge vector.
 */
function edgeBetween(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): AxisVector {
  return { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
}

/**
 * Projects a 3D polygon onto its best-fit plane axes.
 *
 * @param points Ordered 3D corners.
 * @returns Projected vertices with original loop indices.
 */
function projectPolygonTo2d(points: ReadonlyArray<{ x: number; y: number; z: number }>): ProjectedPolygonVertex[] {
  const basis = buildPolygonPlaneBasis(computeNewellNormal(points));
  if (!basis) {
    return [];
  }
  const projected: ProjectedPolygonVertex[] = [];
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    if (!point) {
      continue;
    }
    projected.push({
      loopIndex: index,
      x: dotAxes(point, basis.u),
      y: dotAxes(point, basis.v),
    });
  }
  return projected;
}

/**
 * Computes a polygon normal with the Newell method.
 *
 * @param points Ordered 3D corners.
 * @returns Normal (not required unit length for axis choice).
 */
function computeNewellNormal(points: ReadonlyArray<{ x: number; y: number; z: number }>): {
  x: number;
  y: number;
  z: number;
} {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let index = 0; index < points.length; index++) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    nx += (current.y - next.y) * (current.z + next.z);
    ny += (current.z - next.z) * (current.x + next.x);
    nz += (current.x - next.x) * (current.y + next.y);
  }
  return { x: nx, y: ny, z: nz };
}

/** One 3D axis vector used while projecting a polygon. */
interface AxisVector {
  x: number;
  y: number;
  z: number;
}

/**
 * Builds a right-handed in-plane basis for a Newell normal.
 *
 * @param normal Polygon normal.
 * @returns Unit U and V axes, or null when the normal is degenerate.
 */
function buildPolygonPlaneBasis(normal: AxisVector): { u: AxisVector; v: AxisVector } | null {
  const u = normalizeAxis(crossAxes(normal, leastAlignedAxis(normal)));
  if (!u) {
    return null;
  }
  const v = normalizeAxis(crossAxes(normal, u));
  if (!v) {
    return null;
  }
  return { u, v };
}

/**
 * Picks the world axis least aligned with a normal.
 *
 * @param normal Polygon normal.
 * @returns Unit world axis.
 */
function leastAlignedAxis(normal: AxisVector): AxisVector {
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  if (ax <= ay && ax <= az) {
    return { x: 1, y: 0, z: 0 };
  }
  if (ay <= ax && ay <= az) {
    return { x: 0, y: 1, z: 0 };
  }
  return { x: 0, y: 0, z: 1 };
}

/**
 * Returns the cross product of two axis vectors.
 *
 * @param a First vector.
 * @param b Second vector.
 * @returns Cross product.
 */
function crossAxes(a: AxisVector, b: AxisVector): AxisVector {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Returns the dot product of two axis vectors.
 *
 * @param a First vector.
 * @param b Second vector.
 * @returns Dot product.
 */
function dotAxes(a: AxisVector, b: AxisVector): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Returns a unit vector, or null when the input is degenerate.
 *
 * @param vector Vector to normalize.
 * @returns Unit vector, or null.
 */
function normalizeAxis(vector: AxisVector): AxisVector | null {
  const length = Math.sqrt(dotAxes(vector, vector));
  if (length < 1e-12) {
    return null;
  }
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

/**
 * Computes twice the signed area of a 2D polygon.
 *
 * @param projected Projected loop.
 * @returns Signed area * 2.
 */
function signedArea2d(projected: readonly ProjectedPolygonVertex[]): number {
  let area = 0;
  for (let index = 0; index < projected.length; index++) {
    const current = projected[index]!;
    const next = projected[(index + 1) % projected.length]!;
    area += current.x * next.y - next.x * current.y;
  }
  return area;
}

/**
 * Ear-clips a projected polygon into triangle index triples, keeping input
 * winding. Among valid ears, the smallest 3D triangle is clipped first so a
 * folded face keeps triangles on its flat sides.
 *
 * @param projected Projected loop in original order.
 * @param orientation Sign of polygon area (+1 or -1).
 * @param points Original 3D corners addressed by loopIndex.
 * @returns Flat triples of original loop indices.
 */
function earClipProjectedPolygon(
  projected: readonly ProjectedPolygonVertex[],
  orientation: number,
  points: ReadonlyArray<{ x: number; y: number; z: number }>,
): number[] {
  const remaining = projected.map((vertex) => ({ ...vertex }));
  const triangles: number[] = [];
  clipEarsUntilTriangle(remaining, orientation, points, triangles);
  appendFinalTriangle(remaining, triangles);
  return triangles;
}

/**
 * Clips ears until three or fewer vertices remain.
 *
 * @param remaining Remaining vertices, mutated.
 * @param orientation Polygon orientation sign.
 * @param points Original 3D corners.
 * @param triangles Output triples.
 */
function clipEarsUntilTriangle(
  remaining: ProjectedPolygonVertex[],
  orientation: number,
  points: ReadonlyArray<{ x: number; y: number; z: number }>,
  triangles: number[],
): void {
  let guard = remaining.length * remaining.length + 8;
  while (remaining.length > 3 && guard-- > 0) {
    const earIndex = findSmallestEarIndex(remaining, orientation, points);
    if (earIndex < 0) {
      break;
    }
    appendEarTriangle(remaining, earIndex, triangles);
    remaining.splice(earIndex, 1);
  }
}

/**
 * Appends the last triangle when three vertices remain.
 *
 * @param remaining Remaining vertices.
 * @param triangles Output triples.
 */
function appendFinalTriangle(remaining: readonly ProjectedPolygonVertex[], triangles: number[]): void {
  if (remaining.length !== 3) {
    return;
  }
  const first = remaining[0];
  const second = remaining[1];
  const third = remaining[2];
  if (!first || !second || !third) {
    return;
  }
  triangles.push(first.loopIndex, second.loopIndex, third.loopIndex);
}

/**
 * Finds the valid ear whose 3D triangle has the smallest area.
 *
 * @param remaining Remaining vertices.
 * @param orientation Polygon orientation sign.
 * @param points Original 3D corners.
 * @returns Ear tip index, or -1 when none found.
 */
function findSmallestEarIndex(
  remaining: readonly ProjectedPolygonVertex[],
  orientation: number,
  points: ReadonlyArray<{ x: number; y: number; z: number }>,
): number {
  let bestIndex = -1;
  let bestArea = Number.POSITIVE_INFINITY;
  for (let index = 0; index < remaining.length; index++) {
    if (!isEar(remaining, index, orientation)) {
      continue;
    }
    const area = earTriangleAreaSquared(remaining, index, points);
    if (area < bestArea) {
      bestArea = area;
      bestIndex = index;
    }
  }
  return bestIndex;
}

/**
 * Returns the squared area of the 3D triangle around an ear tip.
 *
 * @param remaining Remaining vertices.
 * @param earIndex Ear tip index.
 * @param points Original 3D corners.
 * @returns Squared triangle area.
 */
function earTriangleAreaSquared(
  remaining: readonly ProjectedPolygonVertex[],
  earIndex: number,
  points: ReadonlyArray<{ x: number; y: number; z: number }>,
): number {
  const count = remaining.length;
  const previous = points[remaining[(earIndex + count - 1) % count]!.loopIndex];
  const current = points[remaining[earIndex]!.loopIndex];
  const next = points[remaining[(earIndex + 1) % count]!.loopIndex];
  if (!previous || !current || !next) {
    return Number.POSITIVE_INFINITY;
  }
  return triangleAreaSquared(previous, current, next);
}

/**
 * Returns the squared area of a 3D triangle.
 *
 * @param a First corner.
 * @param b Second corner.
 * @param c Third corner.
 * @returns Squared area.
 */
function triangleAreaSquared(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  c: { x: number; y: number; z: number },
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  const cx = aby * acz - abz * acy;
  const cy = abz * acx - abx * acz;
  const cz = abx * acy - aby * acx;
  return cx * cx + cy * cy + cz * cz;
}

/**
 * Appends one ear triangle in original loop winding.
 *
 * @param remaining Remaining vertices.
 * @param earIndex Ear tip index.
 * @param triangles Output triples.
 */
function appendEarTriangle(remaining: readonly ProjectedPolygonVertex[], earIndex: number, triangles: number[]): void {
  const count = remaining.length;
  const previous = remaining[(earIndex + count - 1) % count]!;
  const current = remaining[earIndex]!;
  const next = remaining[(earIndex + 1) % count]!;
  triangles.push(previous.loopIndex, current.loopIndex, next.loopIndex);
}

/**
 * Returns whether the vertex at index is an ear tip for the given orientation.
 *
 * @param remaining Remaining vertices.
 * @param earIndex Candidate tip.
 * @param orientation Polygon orientation sign.
 * @returns True when the tip forms a valid ear.
 */
function isEar(remaining: readonly ProjectedPolygonVertex[], earIndex: number, orientation: number): boolean {
  const count = remaining.length;
  const previous = remaining[(earIndex + count - 1) % count]!;
  const current = remaining[earIndex]!;
  const next = remaining[(earIndex + 1) % count]!;
  if (cross2d(previous, current, next) * orientation <= 1e-12) {
    return false;
  }
  return !earContainsAnotherPoint(remaining, earIndex, previous, current, next);
}

/**
 * Returns whether a non-corner point lies in an ear triangle.
 *
 * @param remaining Remaining vertices.
 * @param earIndex Ear tip index.
 * @param previous Previous corner.
 * @param current Ear tip.
 * @param next Next corner.
 * @returns True when another point blocks the ear.
 */
function earContainsAnotherPoint(
  remaining: readonly ProjectedPolygonVertex[],
  earIndex: number,
  previous: ProjectedPolygonVertex,
  current: ProjectedPolygonVertex,
  next: ProjectedPolygonVertex,
): boolean {
  const count = remaining.length;
  for (let index = 0; index < count; index++) {
    if (isEarCornerIndex(index, earIndex, count)) {
      continue;
    }
    const candidate = remaining[index];
    if (!candidate || projectedPointMatchesEar(candidate, previous, current, next)) {
      continue;
    }
    if (pointInTriangle2d(candidate, previous, current, next)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns whether an index is the ear tip or one of its neighbors.
 *
 * @param index Candidate index.
 * @param earIndex Ear tip index.
 * @param count Remaining vertex count.
 * @returns True when the index is an ear corner.
 */
function isEarCornerIndex(index: number, earIndex: number, count: number): boolean {
  if (index === earIndex) {
    return true;
  }
  if (index === (earIndex + count - 1) % count) {
    return true;
  }
  return index === (earIndex + 1) % count;
}

/**
 * Returns whether a projected point sits on an ear corner.
 *
 * @param point Query point.
 * @param previous Previous corner.
 * @param current Ear tip.
 * @param next Next corner.
 * @returns True when the point matches a corner.
 */
function projectedPointMatchesEar(
  point: ProjectedPolygonVertex,
  previous: ProjectedPolygonVertex,
  current: ProjectedPolygonVertex,
  next: ProjectedPolygonVertex,
): boolean {
  if (projectedPointsMatch(point, previous) || projectedPointsMatch(point, current)) {
    return true;
  }
  return projectedPointsMatch(point, next);
}

/**
 * Returns whether two projected points are the same location.
 *
 * @param first First point.
 * @param second Second point.
 * @returns True when the points coincide.
 */
function projectedPointsMatch(first: ProjectedPolygonVertex, second: ProjectedPolygonVertex): boolean {
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  return dx * dx + dy * dy <= 1e-16;
}

/**
 * Cross product z-component for the turn a→b→c in 2D.
 *
 * @param a First point.
 * @param b Second point.
 * @param c Third point.
 * @returns Cross z.
 */
function cross2d(a: ProjectedPolygonVertex, b: ProjectedPolygonVertex, c: ProjectedPolygonVertex): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/**
 * Returns whether point p lies inside triangle abc (inclusive edges).
 *
 * @param point Query point.
 * @param a Triangle corner.
 * @param b Triangle corner.
 * @param c Triangle corner.
 * @returns True when inside.
 */
function pointInTriangle2d(
  point: ProjectedPolygonVertex,
  a: ProjectedPolygonVertex,
  b: ProjectedPolygonVertex,
  c: ProjectedPolygonVertex,
): boolean {
  const c1 = cross2d(a, b, point);
  const c2 = cross2d(b, c, point);
  const c3 = cross2d(c, a, point);
  const hasNeg = c1 < -1e-12 || c2 < -1e-12 || c3 < -1e-12;
  const hasPos = c1 > 1e-12 || c2 > 1e-12 || c3 > 1e-12;
  return !(hasNeg && hasPos);
}

/**
 * Returns whether a 3D triangle has non-zero area.
 *
 * @param a First corner.
 * @param b Second corner.
 * @param c Third corner.
 * @returns True when area is positive.
 */
function isTriangleAreaPositive3d(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  c: { x: number; y: number; z: number },
): boolean {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  const cx = aby * acz - abz * acy;
  const cy = abz * acx - abx * acz;
  const cz = abx * acy - aby * acx;
  return cx * cx + cy * cy + cz * cz > 1e-20;
}
