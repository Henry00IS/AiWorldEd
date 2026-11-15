/** 2D point. */
export type ScadPoint2 = [number, number];

/** Tolerance for orientation tests. */
const SCAD_POLYGON_EPSILON = 1e-9;

/**
 * Cross product of (b - a) and (c - a).
 *
 * @param a First point.
 * @param b Second point.
 * @param c Third point.
 * @returns Twice the signed triangle area.
 */
function scadCross(a: ScadPoint2, b: ScadPoint2, c: ScadPoint2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/**
 * Signed area of a polygon, positive when counter-clockwise.
 *
 * @param points Polygon points.
 * @returns Signed area.
 */
export function scadPolygonArea(points: ScadPoint2[]): number {
  let area = 0;
  points.forEach((point, index) => {
    const following = points[(index + 1) % points.length] as ScadPoint2;
    area += point[0] * following[1] - following[0] * point[1];
  });
  return area / 2;
}

/**
 * Tests whether point p lies inside or on triangle abc (counter-clockwise).
 *
 * @param p Point.
 * @param a Triangle corner.
 * @param b Triangle corner.
 * @param c Triangle corner.
 * @returns True when inside.
 */
function scadTriangleContains(p: ScadPoint2, a: ScadPoint2, b: ScadPoint2, c: ScadPoint2): boolean {
  return (
    scadCross(a, b, p) >= -SCAD_POLYGON_EPSILON &&
    scadCross(b, c, p) >= -SCAD_POLYGON_EPSILON &&
    scadCross(c, a, p) >= -SCAD_POLYGON_EPSILON
  );
}

/**
 * Splits a simple counter-clockwise polygon into triangles by ear clipping.
 *
 * @param points Polygon points.
 * @returns Triangles as index triples.
 */
function scadPolygonTriangulate(points: ScadPoint2[]): number[][] {
  const remaining = points.map((_, index) => index);
  const triangles: number[][] = [];
  while (remaining.length > 3) {
    const ear = remaining.findIndex((_, slot) => scadPolygonIsEar(points, remaining, slot));
    if (ear < 0) throw new Error('polygon is self-intersecting');
    const count = remaining.length;
    triangles.push([remaining[(ear + count - 1) % count], remaining[ear], remaining[(ear + 1) % count]] as number[]);
    remaining.splice(ear, 1);
  }
  triangles.push(remaining);
  return triangles;
}

/**
 * Tests whether the corner at a slot of the remaining polygon is an ear.
 *
 * @param points All points.
 * @param remaining Remaining point indices.
 * @param slot Slot of the candidate corner.
 * @returns True when the corner is convex and holds no other point.
 */
function scadPolygonIsEar(points: ScadPoint2[], remaining: number[], slot: number): boolean {
  const count = remaining.length;
  const [a, b, c] = [-1, 0, 1].map(
    (offset) => points[remaining[(slot + offset + count) % count] as number] as ScadPoint2,
  ) as [ScadPoint2, ScadPoint2, ScadPoint2];
  if (scadCross(a, b, c) <= SCAD_POLYGON_EPSILON) return false;
  return remaining.every((index) => {
    const point = points[index] as ScadPoint2;
    return point === a || point === b || point === c || !scadTriangleContains(point, a, b, c);
  });
}

/**
 * Tests whether an index polygon is convex.
 *
 * @param points All points.
 * @param polygon Point indices, counter-clockwise.
 * @returns True when convex.
 */
function scadPolygonIsConvex(points: ScadPoint2[], polygon: number[]): boolean {
  return polygon.every((index, slot) => {
    const following = polygon[(slot + 1) % polygon.length] as number;
    const after = polygon[(slot + 2) % polygon.length] as number;
    return (
      scadCross(points[index] as ScadPoint2, points[following] as ScadPoint2, points[after] as ScadPoint2) >=
      -SCAD_POLYGON_EPSILON
    );
  });
}

/**
 * Joins two polygons that share the edge a→b (in first) and b→a (in second).
 *
 * @param first First polygon.
 * @param second Second polygon.
 * @returns Joined polygon, or null when they share no edge.
 */
function scadPolygonJoin(first: number[], second: number[]): number[] | null {
  for (let slot = 0; slot < first.length; slot++) {
    const a = first[slot] as number;
    const b = first[(slot + 1) % first.length] as number;
    const other = second.indexOf(b);
    if (other < 0 || second[(other + 1) % second.length] !== a) continue;
    const firstPath = [...first.slice(slot + 1), ...first.slice(0, slot + 1)];
    const secondPath = [...second.slice(other + 1), ...second.slice(0, other + 1)];
    return [...firstPath, ...secondPath.slice(1, -1)];
  }
  return null;
}

/**
 * Splits a simple polygon into convex pieces: ear clipping, then merging
 * neighbouring triangles while the merge stays convex.
 *
 * @param input Polygon points in either winding.
 * @returns Convex polygons, counter-clockwise.
 */
export function scadPolygonConvexPieces(input: ScadPoint2[]): ScadPoint2[][] {
  if (input.length < 3) throw new Error('polygon needs at least 3 points');
  const points = scadPolygonArea(input) < 0 ? [...input].reverse() : input;
  if (
    scadPolygonIsConvex(
      points,
      points.map((_, index) => index),
    )
  )
    return [points];
  const pieces = scadPolygonTriangulate(points);
  let merged = true;
  while (merged) merged = scadPolygonMergeOnce(points, pieces);
  return pieces.map((piece) => piece.map((index) => points[index] as ScadPoint2));
}

/**
 * Merges the first pair of pieces whose union is convex.
 *
 * @param points All points.
 * @param pieces Index polygons, changed in place.
 * @returns True when a merge happened.
 */
function scadPolygonMergeOnce(points: ScadPoint2[], pieces: number[][]): boolean {
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const joined = scadPolygonJoin(pieces[i] as number[], pieces[j] as number[]);
      if (!joined || !scadPolygonIsConvex(points, joined)) continue;
      pieces[i] = joined;
      pieces.splice(j, 1);
      return true;
    }
  }
  return false;
}

/**
 * Computes the convex hull of 2D points (monotone chain).
 *
 * @param input Points.
 * @returns Hull points, counter-clockwise.
 */
export function scadPolygonHull(input: ScadPoint2[]): ScadPoint2[] {
  const points = [...input].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const chain = (list: ScadPoint2[]): ScadPoint2[] => {
    const hull: ScadPoint2[] = [];
    for (const point of list) {
      while (
        hull.length >= 2 &&
        scadCross(hull[hull.length - 2] as ScadPoint2, hull[hull.length - 1] as ScadPoint2, point) <= 0
      )
        hull.pop();
      hull.push(point);
    }
    return hull.slice(0, -1);
  };
  return [...chain(points), ...chain([...points].reverse())];
}
