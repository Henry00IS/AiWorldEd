/** 2D point. */
export type SolidScriptPoint2 = [number, number];

/** Tolerance for orientation tests. */
const SOLID_SCRIPT_POLYGON_EPSILON = 1e-9;

/**
 * Cross product of (b - a) and (c - a).
 *
 * @param a First point.
 * @param b Second point.
 * @param c Third point.
 * @returns Twice the signed triangle area.
 */
function solidScriptCross(a: SolidScriptPoint2, b: SolidScriptPoint2, c: SolidScriptPoint2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/**
 * Signed area of a polygon, positive when counter-clockwise.
 *
 * @param points Polygon points.
 * @returns Signed area.
 */
export function solidScriptPolygonArea(points: SolidScriptPoint2[]): number {
  let area = 0;
  points.forEach((point, index) => {
    const following = points[(index + 1) % points.length] as SolidScriptPoint2;
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
function solidScriptTriangleContains(
  p: SolidScriptPoint2,
  a: SolidScriptPoint2,
  b: SolidScriptPoint2,
  c: SolidScriptPoint2,
): boolean {
  return (
    solidScriptCross(a, b, p) >= -SOLID_SCRIPT_POLYGON_EPSILON &&
    solidScriptCross(b, c, p) >= -SOLID_SCRIPT_POLYGON_EPSILON &&
    solidScriptCross(c, a, p) >= -SOLID_SCRIPT_POLYGON_EPSILON
  );
}

/**
 * Splits a simple counter-clockwise polygon into triangles by ear clipping.
 *
 * @param points Polygon points.
 * @returns Triangles as index triples.
 */
function solidScriptPolygonTriangulate(points: SolidScriptPoint2[]): number[][] {
  const remaining = points.map((_, index) => index);
  const triangles: number[][] = [];
  while (remaining.length > 3) {
    const ear = remaining.findIndex((_, slot) => solidScriptPolygonIsEar(points, remaining, slot));
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
function solidScriptPolygonIsEar(points: SolidScriptPoint2[], remaining: number[], slot: number): boolean {
  const count = remaining.length;
  const [a, b, c] = [-1, 0, 1].map(
    (offset) => points[remaining[(slot + offset + count) % count] as number] as SolidScriptPoint2,
  ) as [SolidScriptPoint2, SolidScriptPoint2, SolidScriptPoint2];
  if (solidScriptCross(a, b, c) <= SOLID_SCRIPT_POLYGON_EPSILON) return false;
  return remaining.every((index) => {
    const point = points[index] as SolidScriptPoint2;
    return point === a || point === b || point === c || !solidScriptTriangleContains(point, a, b, c);
  });
}

/**
 * Tests whether an index polygon is convex.
 *
 * @param points All points.
 * @param polygon Point indices, counter-clockwise.
 * @returns True when convex.
 */
function solidScriptPolygonIsConvex(points: SolidScriptPoint2[], polygon: number[]): boolean {
  return polygon.every((index, slot) => {
    const following = polygon[(slot + 1) % polygon.length] as number;
    const after = polygon[(slot + 2) % polygon.length] as number;
    return (
      solidScriptCross(
        points[index] as SolidScriptPoint2,
        points[following] as SolidScriptPoint2,
        points[after] as SolidScriptPoint2,
      ) >= -SOLID_SCRIPT_POLYGON_EPSILON
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
function solidScriptPolygonJoin(first: number[], second: number[]): number[] | null {
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
/**
 * Splits a simple polygon into convex index polygons referencing the input
 * corner positions, in counter-clockwise winding.
 *
 * @param input Polygon points in either winding.
 * @returns Corner index lists per convex piece.
 */
export function solidScriptPolygonConvexIndices(input: SolidScriptPoint2[]): number[][] {
  if (input.length < 3) throw new Error('polygon needs at least 3 points');
  const reversed = solidScriptPolygonArea(input) < 0;
  const points = reversed ? [...input].reverse() : input;
  const raw = solidScriptPolygonIsConvex(
    points,
    points.map((_, index) => index),
  )
    ? [points.map((_, index) => index)]
    : solidScriptPolygonMerged(points);
  return reversed ? raw.map((piece) => piece.map((index) => input.length - 1 - index)) : raw;
}

/**
 * Triangulates a simple counter-clockwise polygon and merges neighbouring
 * triangles while their union remains convex.
 *
 * @param points Counter-clockwise polygon points.
 * @returns Merged index polygons.
 */
function solidScriptPolygonMerged(points: SolidScriptPoint2[]): number[][] {
  const pieces = solidScriptPolygonTriangulate(points);
  let merged = true;
  while (merged) merged = solidScriptPolygonMergeOnce(points, pieces);
  return pieces;
}

/**
 * Splits a simple polygon into convex pieces: ear clipping, then merging
 * neighbouring triangles while the merge stays convex.
 *
 * @param input Polygon points in either winding.
 * @returns Convex polygons, counter-clockwise.
 */
export function solidScriptPolygonConvexPieces(input: SolidScriptPoint2[]): SolidScriptPoint2[][] {
  return solidScriptPolygonConvexIndices(input).map((piece) => piece.map((index) => input[index] as SolidScriptPoint2));
}

/**
 * Merges the first pair of pieces whose union is convex.
 *
 * @param points All points.
 * @param pieces Index polygons, changed in place.
 * @returns True when a merge happened.
 */
function solidScriptPolygonMergeOnce(points: SolidScriptPoint2[], pieces: number[][]): boolean {
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const joined = solidScriptPolygonJoin(pieces[i] as number[], pieces[j] as number[]);
      if (!joined || !solidScriptPolygonIsConvex(points, joined)) continue;
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
export function solidScriptPolygonHull(input: SolidScriptPoint2[]): SolidScriptPoint2[] {
  const points = [...input].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const chain = (list: SolidScriptPoint2[]): SolidScriptPoint2[] => {
    const hull: SolidScriptPoint2[] = [];
    for (const point of list) {
      while (
        hull.length >= 2 &&
        solidScriptCross(
          hull[hull.length - 2] as SolidScriptPoint2,
          hull[hull.length - 1] as SolidScriptPoint2,
          point,
        ) <= 0
      )
        hull.pop();
      hull.push(point);
    }
    return hull.slice(0, -1);
  };
  return [...chain(points), ...chain([...points].reverse())];
}
