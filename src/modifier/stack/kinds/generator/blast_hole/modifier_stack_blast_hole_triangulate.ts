import type * as THREE from 'three';
import { blastHoleCross } from './modifier_stack_blast_hole_simple.js';

/** One triangle as three corner indices, counter-clockwise. */
export type BlastHoleTriangle = [number, number, number];

/**
 * Returns whether a point lies inside or on a counter-clockwise triangle.
 *
 * @param a First corner.
 * @param b Second corner.
 * @param c Third corner.
 * @param point Point.
 * @returns True inside or on its edges.
 */
function blastHoleTriangleHolds(a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, point: THREE.Vector2): boolean {
  return blastHoleCross(a, b, point) >= 0 && blastHoleCross(b, c, point) >= 0 && blastHoleCross(c, a, point) >= 0;
}

/**
 * Returns whether the corner at a position of the remaining ring is an ear: it
 * turns left and no other remaining corner lies in its triangle.
 *
 * @param points Polygon points.
 * @param ring Remaining corner indices.
 * @param at Position in the ring.
 * @returns True for an ear.
 */
function blastHoleIsEar(points: readonly THREE.Vector2[], ring: readonly number[], at: number): boolean {
  const count = ring.length;
  const a = points[ring[(at + count - 1) % count]!]!;
  const b = points[ring[at]!]!;
  const c = points[ring[(at + 1) % count]!]!;
  if (blastHoleCross(a, b, c) <= 0) return false;
  return !ring.some((index, position) => {
    if (Math.abs(position - at) <= 1 || Math.abs(position - at) === count - 1) return false;
    const point = points[index]!;
    return !point.equals(a) && !point.equals(c) && blastHoleTriangleHolds(a, b, c, point);
  });
}

/**
 * Triangulates a simple counter-clockwise polygon by clipping ears.
 *
 * @param points Polygon points.
 * @returns Triangles, or null when the polygon is not simple enough to clip.
 */
export function blastHoleEarClip(points: readonly THREE.Vector2[]): BlastHoleTriangle[] | null {
  const ring = points.map((_, index) => index);
  const triangles: BlastHoleTriangle[] = [];
  let at = 0;
  let misses = 0;
  while (ring.length > 3) {
    if (misses > ring.length) return null;
    at %= ring.length;
    if (!blastHoleIsEar(points, ring, at)) {
      at++;
      misses++;
      continue;
    }
    triangles.push([ring[(at + ring.length - 1) % ring.length]!, ring[at]!, ring[(at + 1) % ring.length]!]);
    ring.splice(at, 1);
    misses = 0;
  }
  triangles.push([ring[0]!, ring[1]!, ring[2]!]);
  return triangles;
}

/**
 * Returns whether point d lies strictly inside the circle through a, b and c.
 *
 * @param a First corner, counter-clockwise.
 * @param b Second corner.
 * @param c Third corner.
 * @param d Point.
 * @returns True inside.
 */
function blastHoleInCircle(a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, d: THREE.Vector2): boolean {
  const ax = a.x - d.x;
  const ay = a.y - d.y;
  const bx = b.x - d.x;
  const by = b.y - d.y;
  const cx = c.x - d.x;
  const cy = c.y - d.y;
  const det =
    (ax * ax + ay * ay) * (bx * cy - cx * by) -
    (bx * bx + by * by) * (ax * cy - cx * ay) +
    (cx * cx + cy * cy) * (ax * by - bx * ay);
  return det > 1e-12 * Math.max(1, Math.abs(ax) + Math.abs(bx) + Math.abs(cx)) ** 4;
}

/**
 * Finds the corner of a triangle opposite an edge, and the edge's order in it.
 *
 * @param triangle Triangle.
 * @param from Edge start.
 * @param to Edge end.
 * @returns Opposite corner, or -1 when the triangle has no edge from-to.
 */
function blastHoleOpposite(triangle: BlastHoleTriangle, from: number, to: number): number {
  for (let corner = 0; corner < 3; corner++)
    if (triangle[corner] === from && triangle[(corner + 1) % 3] === to) return triangle[(corner + 2) % 3]!;
  return -1;
}

/**
 * Indexes which triangle holds each directed edge.
 *
 * @param triangles Triangles.
 * @returns Triangle index per edge key.
 */
function blastHoleTriangleEdges(triangles: readonly BlastHoleTriangle[]): Map<string, number> {
  const edges = new Map<string, number>();
  triangles.forEach((triangle, index) => {
    for (let corner = 0; corner < 3; corner++) edges.set(`${triangle[corner]}>${triangle[(corner + 1) % 3]}`, index);
  });
  return edges;
}

/**
 * Flips the edge a-b shared by triangle (a, b, c) and its neighbour (b, a, d)
 * when d lies inside the circle of the first and the quad is convex.
 *
 * @param points Points.
 * @param triangles Triangles, changed in place.
 * @param first Index of the first triangle.
 * @param second Index of the neighbour.
 * @param corner Corner of the first triangle where the edge starts.
 * @returns True when flipped.
 */
function blastHoleFlipEdge(
  points: readonly THREE.Vector2[],
  triangles: BlastHoleTriangle[],
  first: number,
  second: number,
  corner: number,
): boolean {
  const triangle = triangles[first]!;
  const a = triangle[corner]!;
  const b = triangle[(corner + 1) % 3]!;
  const c = triangle[(corner + 2) % 3]!;
  const d = blastHoleOpposite(triangles[second]!, b, a);
  if (d < 0 || !blastHoleInCircle(points[a]!, points[b]!, points[c]!, points[d]!)) return false;
  if (blastHoleCross(points[c]!, points[a]!, points[d]!) <= 0) return false;
  if (blastHoleCross(points[d]!, points[b]!, points[c]!) <= 0) return false;
  triangles[first] = [c, a, d];
  triangles[second] = [d, b, c];
  return true;
}

/**
 * Runs one sweep of edge flips; a triangle flipped in this sweep is not touched
 * again until the next one.
 *
 * @param points Points.
 * @param triangles Triangles, changed in place.
 * @returns True when anything flipped.
 */
function blastHoleFlipSweep(points: readonly THREE.Vector2[], triangles: BlastHoleTriangle[]): boolean {
  const edges = blastHoleTriangleEdges(triangles);
  const touched = new Set<number>();
  for (let first = 0; first < triangles.length; first++)
    for (let corner = 0; corner < 3 && !touched.has(first); corner++) {
      const triangle = triangles[first]!;
      const second = edges.get(`${triangle[(corner + 1) % 3]}>${triangle[corner]}`);
      if (second === undefined || touched.has(second)) continue;
      if (blastHoleFlipEdge(points, triangles, first, second, corner)) touched.add(first).add(second);
    }
  return touched.size > 0;
}

/**
 * Turns a triangulation into its constrained Delaunay one by flipping inner
 * edges, which keeps triangles as fat as the outline allows.
 *
 * @param points Points.
 * @param triangles Triangles, changed in place.
 * @returns The same triangles.
 */
export function blastHoleDelaunayFlip(
  points: readonly THREE.Vector2[],
  triangles: BlastHoleTriangle[],
): BlastHoleTriangle[] {
  for (let sweep = 0; sweep < triangles.length * 4 + 16; sweep++) if (!blastHoleFlipSweep(points, triangles)) break;
  return triangles;
}

/**
 * Adds a point inside the triangulation: the triangle that holds it strictly is
 * split into three. Points on an edge or outside are left out.
 *
 * @param points Points.
 * @param triangles Triangles, changed in place.
 * @param index Index of the new point.
 * @returns True when the point was added.
 */
export function blastHoleInsertPoint(
  points: readonly THREE.Vector2[],
  triangles: BlastHoleTriangle[],
  index: number,
): boolean {
  const point = points[index]!;
  const holder = triangles.findIndex(
    ([a, b, c]) =>
      blastHoleCross(points[a]!, points[b]!, point) > 1e-12 &&
      blastHoleCross(points[b]!, points[c]!, point) > 1e-12 &&
      blastHoleCross(points[c]!, points[a]!, point) > 1e-12,
  );
  if (holder < 0) return false;
  const [a, b, c] = triangles[holder]!;
  triangles.splice(holder, 1, [a, b, index], [b, c, index], [c, a, index]);
  return true;
}
