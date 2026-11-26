import * as THREE from 'three';
import type { SolidScriptFaceFacts } from './solid_script_geometry.js';

/** Most points one scatter line may give. */
export const SOLID_SCRIPT_SCATTER_MOST = 10000;

/** Tries per wanted point before Spacing gives up on fitting more. */
const SOLID_SCRIPT_SCATTER_TRIES = 30;

/** One point Scatter On Faces gives, on its face. */
export interface SolidScriptScatterPoint {
  position: THREE.Vector3;
  face: SolidScriptFaceFacts;
}

/** A triangle of a face, with its area. */
interface SolidScriptScatterTriangle {
  face: SolidScriptFaceFacts;
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  area: number;
}

/**
 * Random numbers 0..1, the same sequence for the same seed.
 *
 * @param seed Seed.
 * @returns Next number.
 */
export function solidScriptScatterRandom(seed: number): () => number {
  let state = (Math.floor(seed * 1000) ^ 0x6d2b79f5) >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rounds an amount up or down at random so that, on average, it keeps its
 * fraction: 2.3 gives 3 about three times in ten.
 *
 * @param amount Amount, 0 or more.
 * @param random Next unit random number.
 * @returns Whole number.
 */
export function solidScriptScatterRound(amount: number, random: () => number): number {
  const whole = Math.floor(amount);
  return whole + (random() < amount - whole ? 1 : 0);
}

/**
 * Splits faces into triangles with some area, each face fanned from its first
 * corner.
 *
 * @param faces Faces, each convex with its corners in order.
 * @returns Triangles.
 */
function solidScriptScatterTriangles(faces: readonly SolidScriptFaceFacts[]): SolidScriptScatterTriangle[] {
  const triangles: SolidScriptScatterTriangle[] = [];
  const edge = new THREE.Vector3();
  const other = new THREE.Vector3();
  for (const face of faces)
    for (let corner = 1; corner + 1 < face.corners.length; corner++) {
      const [a, b, c] = [face.corners[0], face.corners[corner], face.corners[corner + 1]];
      if (!a || !b || !c) continue;
      const area = edge.subVectors(b, a).cross(other.subVectors(c, a)).length() / 2;
      if (area > 1e-12) triangles.push({ face, a, b, c, area });
    }
  return triangles;
}

/**
 * A uniform random point on a triangle.
 *
 * @param triangle Triangle.
 * @param random Next unit random number.
 * @returns Point, on the triangle's face.
 */
function solidScriptScatterOnTriangle(
  triangle: SolidScriptScatterTriangle,
  random: () => number,
): SolidScriptScatterPoint {
  const root = Math.sqrt(random());
  const along = random();
  const position = new THREE.Vector3()
    .addScaledVector(triangle.a, 1 - root)
    .addScaledVector(triangle.b, root * (1 - along))
    .addScaledVector(triangle.c, root * along);
  return { position, face: triangle.face };
}

/**
 * Picks the first triangle whose running area reaches the target.
 *
 * @param triangles Triangles.
 * @param reach Running area after each triangle.
 * @param target Value from 0 to the total area.
 * @returns Triangle.
 */
function solidScriptScatterPick(
  triangles: readonly SolidScriptScatterTriangle[],
  reach: readonly number[],
  target: number,
): SolidScriptScatterTriangle {
  let low = 0;
  let high = reach.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((reach[middle] ?? 0) < target) low = middle + 1;
    else high = middle;
  }
  const triangle = triangles[low] ?? triangles[0];
  if (!triangle) throw new Error('Scatter On Faces found no faces with any area');
  return triangle;
}

/** Points kept by the spacer, by grid cell: x, then y, then z. */
type SolidScriptScatterCells = Map<number, Map<number, Map<number, THREE.Vector3[]>>>;

/**
 * Lists the points kept in one grid cell.
 *
 * @param cells Points by cell.
 * @param x Cell along x.
 * @param y Cell along y.
 * @param z Cell along z.
 * @param make Adds the cell when it is missing.
 * @returns Points, or undefined when the cell is missing and not made.
 */
function solidScriptScatterCell(
  cells: SolidScriptScatterCells,
  x: number,
  y: number,
  z: number,
  make = false,
): THREE.Vector3[] | undefined {
  let byY = cells.get(x);
  if (!byY && make) cells.set(x, (byY = new Map()));
  let byZ = byY?.get(y);
  if (byY && !byZ && make) byY.set(y, (byZ = new Map()));
  let points = byZ?.get(z);
  if (byZ && !points && make) byZ.set(z, (points = []));
  return points;
}

/**
 * Keeps points a distance apart: each call tells whether a point is far enough
 * from every point kept so far, and keeps it when it is. A spacing of 0 keeps
 * every point.
 *
 * @param spacing Smallest distance, in metres.
 * @returns Test that keeps the point when it passes.
 */
export function solidScriptScatterSpacer(spacing: number): (point: THREE.Vector3) => boolean {
  if (spacing <= 0) return () => true;
  const cells: SolidScriptScatterCells = new Map();
  return (point) => {
    const x = Math.floor(point.x / spacing);
    const y = Math.floor(point.y / spacing);
    const z = Math.floor(point.z / spacing);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++)
          for (const kept of solidScriptScatterCell(cells, x + dx, y + dy, z + dz) ?? [])
            if (kept.distanceTo(point) < spacing) return false;
    solidScriptScatterCell(cells, x, y, z, true)!.push(point);
    return true;
  };
}

/**
 * Takes points from a random stream until there are enough, skipping those the
 * spacer turns down, and stops early when too many tries fail.
 *
 * @param count Points wanted.
 * @param next Next random point.
 * @param at Position of a point.
 * @param keep Spacer from solidScriptScatterSpacer.
 * @returns Points kept, at most count.
 */
export function solidScriptScatterTake<T>(
  count: number,
  next: () => T,
  at: (item: T) => THREE.Vector3,
  keep: (point: THREE.Vector3) => boolean,
): T[] {
  const kept: T[] = [];
  for (let tries = 0; kept.length < count && tries < count * SOLID_SCRIPT_SCATTER_TRIES; tries++) {
    const item = next();
    if (keep(at(item))) kept.push(item);
  }
  return kept;
}

/**
 * Spreads a set number of points at random over faces, evenly by area: each
 * point picks a triangle by its share of the area, then a spot inside it. The
 * same seed always gives the same points.
 *
 * @param faces Faces, each convex with its corners in order.
 * @param count How many points.
 * @param seed Seed.
 * @param spacing Smallest distance between points; 0 for none.
 * @returns Points in order.
 */
export function solidScriptScatterByCount(
  faces: readonly SolidScriptFaceFacts[],
  count: number,
  seed: number,
  spacing: number,
): SolidScriptScatterPoint[] {
  const triangles = solidScriptScatterTriangles(faces);
  if (triangles.length === 0) return [];
  let total = 0;
  const reach = triangles.map((triangle) => (total += triangle.area));
  const random = solidScriptScatterRandom(seed);
  const next = (): SolidScriptScatterPoint =>
    solidScriptScatterOnTriangle(solidScriptScatterPick(triangles, reach, random() * total), random);
  return solidScriptScatterTake(count, next, (point) => point.position, solidScriptScatterSpacer(spacing));
}

/**
 * Spreads points over faces by density: each triangle gets its area times its
 * face's density in points, rounded at random, so bigger and denser faces get
 * more. Each triangle draws from its own random stream of the seed, so a higher
 * density keeps every point a lower one gave. A density below 0 counts as 0.
 *
 * @param faces Faces, each convex with its corners in order.
 * @param densityOf Points per square metre on a face.
 * @param seed Seed.
 * @param spacing Smallest distance between points; 0 for none.
 * @returns Points in order.
 */
export function solidScriptScatterByDensity(
  faces: readonly SolidScriptFaceFacts[],
  densityOf: (face: SolidScriptFaceFacts) => number,
  seed: number,
  spacing: number,
): SolidScriptScatterPoint[] {
  const keep = solidScriptScatterSpacer(spacing);
  const densities = new Map(faces.map((face) => [face, Math.max(0, densityOf(face))]));
  const points: SolidScriptScatterPoint[] = [];
  for (const [index, triangle] of solidScriptScatterTriangles(faces).entries()) {
    const random = solidScriptScatterRandom(seed * 7919 + index);
    const count = solidScriptScatterRound(triangle.area * (densities.get(triangle.face) ?? 0), random);
    if (points.length + count > SOLID_SCRIPT_SCATTER_MOST)
      throw new Error(`Density gives more than ${SOLID_SCRIPT_SCATTER_MOST} points; use a lower Density`);
    const next = (): SolidScriptScatterPoint => solidScriptScatterOnTriangle(triangle, random);
    points.push(...solidScriptScatterTake(count, next, (point) => point.position, keep));
  }
  return points;
}
