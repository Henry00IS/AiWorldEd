import type * as THREE from 'three';
import {
  blastHoleEdgeKey,
  type BlastHoleTriangle,
} from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_triangulate.js';
import { blastHoleCross } from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_simple.js';

/**
 * Makes every edge a side of the triangles: the edges of triangles that cross
 * it are turned, one quad at a time, until none does, and an edge that runs
 * through another point is kept as two edges meeting there.
 *
 * @param flat Points on the plane.
 * @param triangles Triangles, changed in place.
 * @param edges Pairs of point numbers to keep.
 * @param label Command, for messages.
 * @returns Keys of the kept edges, for blastHoleEdgeKey.
 */
export function solidScriptFillConstrain(
  flat: readonly THREE.Vector2[],
  triangles: BlastHoleTriangle[],
  edges: readonly [number, number][],
  label: string,
): Set<string> {
  const fixed = new Set<string>();
  for (const [a, b] of edges) solidScriptFillForce(flat, triangles, a, b, fixed, label);
  return fixed;
}

/**
 * Keeps one edge, split at any point it runs through.
 *
 * @param flat Points on the plane.
 * @param triangles Triangles, changed in place.
 * @param a One end.
 * @param b Other end.
 * @param fixed Kept edges, added to.
 * @param label Command, for messages.
 */
function solidScriptFillForce(
  flat: readonly THREE.Vector2[],
  triangles: BlastHoleTriangle[],
  a: number,
  b: number,
  fixed: Set<string>,
  label: string,
): void {
  if (a === b) return;
  const through = solidScriptFillThrough(flat, a, b);
  if (through >= 0) {
    solidScriptFillForce(flat, triangles, a, through, fixed, label);
    solidScriptFillForce(flat, triangles, through, b, fixed, label);
    return;
  }
  for (let step = 0; step <= 4 * triangles.length + 16; step++) {
    if (solidScriptFillSides(triangles).has(`${a}>${b}`)) {
      fixed.add(blastHoleEdgeKey(a, b));
      return;
    }
    if (!solidScriptFillTurnCrossing(flat, triangles, a, b, fixed)) break;
  }
  throw new Error(`${label} needs Edges that do not cross each other`);
}

/**
 * The point nearest A that lies on the edge from A to B, strictly between.
 *
 * @param flat Points on the plane.
 * @param a One end.
 * @param b Other end.
 * @returns Point number, or -1.
 */
function solidScriptFillThrough(flat: readonly THREE.Vector2[], a: number, b: number): number {
  const along = flat[b]!.clone().sub(flat[a]!);
  let best = -1;
  let nearest = 1;
  flat.forEach((point, index) => {
    const t = point.clone().sub(flat[a]!).dot(along) / along.lengthSq();
    const off = Math.abs(blastHoleCross(flat[a]!, flat[b]!, point));
    if (index !== a && index !== b && t > 1e-9 && t < nearest && off <= 1e-9 * along.lengthSq())
      [best, nearest] = [index, t];
  });
  return best;
}

/**
 * Every directed side of the triangles, as "from>to".
 *
 * @param triangles Triangles.
 * @returns Sides, with the triangle and corner each starts at.
 */
function solidScriptFillSides(triangles: readonly BlastHoleTriangle[]): Map<string, [number, number]> {
  const sides = new Map<string, [number, number]>();
  triangles.forEach((triangle, index) =>
    triangle.forEach((from, corner) => sides.set(`${from}>${triangle[(corner + 1) % 3]}`, [index, corner])),
  );
  return sides;
}

/**
 * Turns one inner edge that crosses the edge from A to B, where the quad of its
 * two triangles is convex.
 *
 * @param flat Points on the plane.
 * @param triangles Triangles, changed in place.
 * @param a One end.
 * @param b Other end.
 * @param fixed Kept edges, which are never turned.
 * @returns True when an edge was turned.
 */
function solidScriptFillTurnCrossing(
  flat: readonly THREE.Vector2[],
  triangles: BlastHoleTriangle[],
  a: number,
  b: number,
  fixed: ReadonlySet<string>,
): boolean {
  const sides = solidScriptFillSides(triangles);
  for (const [key, [first, corner]] of sides) {
    const [u = 0, v = 0] = key.split('>').map(Number);
    const second = sides.get(`${v}>${u}`);
    if (!second || !solidScriptFillCrosses(flat, a, b, u, v)) continue;
    if (fixed.has(blastHoleEdgeKey(u, v))) return false;
    const c = triangles[first]![(corner + 2) % 3]!;
    const d = triangles[second[0]]![(second[1] + 2) % 3]!;
    if (blastHoleCross(flat[c]!, flat[u]!, flat[d]!) <= 1e-12 || blastHoleCross(flat[d]!, flat[v]!, flat[c]!) <= 1e-12)
      continue;
    triangles[first] = [c, u, d];
    triangles[second[0]] = [d, v, c];
    return true;
  }
  return false;
}

/**
 * Whether the edge from U to V crosses the edge from A to B away from their
 * ends.
 *
 * @param flat Points on the plane.
 * @param a One end of the first edge.
 * @param b Other end.
 * @param u One end of the second edge.
 * @param v Other end.
 * @returns True when they cross.
 */
function solidScriptFillCrosses(flat: readonly THREE.Vector2[], a: number, b: number, u: number, v: number): boolean {
  if (u === a || u === b || v === a || v === b) return false;
  const [pa, pb, pu, pv] = [flat[a]!, flat[b]!, flat[u]!, flat[v]!];
  return (
    blastHoleCross(pa, pb, pu) * blastHoleCross(pa, pb, pv) < 0 &&
    blastHoleCross(pu, pv, pa) * blastHoleCross(pu, pv, pb) < 0
  );
}

/**
 * Joins triangles across every edge that is not kept into one face each, so the
 * kept edges and the hull bound the faces. A region whose border is not one
 * simple loop, such as one round a hole, stays as triangles.
 *
 * @param triangles Triangles.
 * @param fixed Kept edges.
 * @returns Faces, each a loop of point numbers.
 */
export function solidScriptFillRegions(
  triangles: readonly BlastHoleTriangle[],
  fixed: ReadonlySet<string>,
): number[][] {
  const sides = solidScriptFillSides(triangles);
  const owner = triangles.map((_, index) => index);
  const root = (index: number): number => (owner[index] === index ? index : (owner[index] = root(owner[index]!)));
  for (const [key, [first]] of sides) {
    const [u = 0, v = 0] = key.split('>').map(Number);
    const second = sides.get(`${v}>${u}`);
    if (second && !fixed.has(blastHoleEdgeKey(u, v))) owner[root(first)] = root(second[0]);
  }
  const regions = new Map<number, BlastHoleTriangle[]>();
  triangles.forEach((triangle, index) => regions.set(root(index), [...(regions.get(root(index)) ?? []), triangle]));
  return [...regions.values()].flatMap((region) => {
    const loop = solidScriptFillBorder(region);
    return loop ? [loop] : region.map((triangle) => [...triangle]);
  });
}

/**
 * The border of a region as one loop, or null when it is not one simple loop.
 *
 * @param region Triangles of the region.
 * @returns Point numbers round the border.
 */
function solidScriptFillBorder(region: readonly BlastHoleTriangle[]): number[] | null {
  const sides = solidScriptFillSides(region);
  const next = new Map<number, number>();
  for (const key of sides.keys()) {
    const [u = 0, v = 0] = key.split('>').map(Number);
    if (sides.has(`${v}>${u}`)) continue;
    if (next.has(u)) return null;
    next.set(u, v);
  }
  const start = next.keys().next().value;
  if (start === undefined) return null;
  const loop = [start];
  for (let at = next.get(start); at !== undefined && at !== start; at = next.get(at)) loop.push(at);
  return loop.length === next.size ? loop : null;
}
