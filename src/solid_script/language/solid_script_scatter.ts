import * as THREE from 'three';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import { solidScriptGeometryScatter, type SolidScriptFaceFacts } from './solid_script_geometry.js';
import { solidScriptValueNumber, solidScriptValueNumbers, type SolidScriptValue } from './solid_script_value.js';

/** Where Scatter Points can put its points. */
export const SOLID_SCRIPT_SCATTER_WHERE = ['On Faces', 'Inside', 'In Box', 'Grid'] as const;

/** One of the Where words. */
export type SolidScriptScatterWhere = (typeof SOLID_SCRIPT_SCATTER_WHERE)[number];

/** Points Scatter Points writes, and face directions when it is On Faces. */
export interface SolidScriptScatterResult {
  positions: THREE.Vector3[];
  normals: THREE.Vector3[] | null;
}

/**
 * Spreads points the way the Where field says: on faces, inside brushes, in a
 * box, or on a grid.
 *
 * @param run Running line.
 * @param faces Faces or brushes in Of, read only when that Where needs them.
 * @returns Positions, and Normals for On Faces.
 */
export function solidScriptScatterRun(
  run: SolidScriptBlockRun,
  faces: () => readonly SolidScriptFaceFacts[],
): SolidScriptScatterResult {
  if (run.text('into').trim() === '') throw new Error('Scatter Points needs a variable in Into for the points');
  const where = solidScriptScatterWhere(run);
  if (where === 'On Faces') return solidScriptScatterOnFaces(run, faces());
  if (where === 'Inside') return { positions: solidScriptScatterInside(run, faces()), normals: null };
  if (where === 'In Box') return { positions: solidScriptScatterInBox(run), normals: null };
  return { positions: solidScriptScatterGrid(run), normals: null };
}

/**
 * Reads Where, or On Faces when the field is empty.
 *
 * @param run Running line.
 * @returns Where word.
 */
export function solidScriptScatterWhere(run: SolidScriptBlockRun): SolidScriptScatterWhere {
  const text = run.text('where').trim() || 'On Faces';
  const match = SOLID_SCRIPT_SCATTER_WHERE.find((word) => word.toLowerCase() === text.toLowerCase());
  if (!match) throw new Error(`Where needs On Faces, Inside, In Box or Grid, not ${text}`);
  return match;
}

/**
 * Spreads points on faces, more on bigger ones. Same seed, same points.
 *
 * @param run Running line.
 * @param faces Faces.
 * @returns Positions and the way each face looks.
 */
function solidScriptScatterOnFaces(
  run: SolidScriptBlockRun,
  faces: readonly SolidScriptFaceFacts[],
): SolidScriptScatterResult {
  const points = solidScriptGeometryScatter(faces, solidScriptScatterCount(run), solidScriptScatterSeed(run));
  return { positions: points.map((point) => point.position), normals: points.map((point) => point.face.normal) };
}

/**
 * Spreads points inside the brushes the faces belong to, more in bigger ones.
 *
 * @param run Running line.
 * @param faces Faces of those brushes.
 * @returns Positions.
 */
function solidScriptScatterInside(run: SolidScriptBlockRun, faces: readonly SolidScriptFaceFacts[]): THREE.Vector3[] {
  const pieces = solidScriptScatterGroups(faces).flatMap((group) => solidScriptScatterPieces(group));
  const total = pieces.reduce((sum, piece) => sum + piece.weight, 0);
  if (pieces.length === 0 || total <= 1e-18)
    throw new Error('Inside needs a brush or mesh with some volume in Of; a flat shape has no inside to scatter in');
  const random = solidScriptScatterRng(solidScriptScatterSeed(run));
  return Array.from({ length: solidScriptScatterCount(run) }, () =>
    solidScriptScatterTetPoint(solidScriptScatterWeighted(pieces, random() * total), random),
  );
}

/**
 * Spreads points at random in a box of Size, centered on the origin, then moved
 * by the blocks around this line.
 *
 * @param run Running line.
 * @returns Positions.
 */
function solidScriptScatterInBox(run: SolidScriptBlockRun): THREE.Vector3[] {
  const size = solidScriptScatterSize(run);
  const random = solidScriptScatterRng(solidScriptScatterSeed(run));
  const matrix = run.matrix();
  return Array.from({ length: solidScriptScatterCount(run) }, () =>
    new THREE.Vector3((random() - 0.5) * size.x, (random() - 0.5) * size.y, (random() - 0.5) * size.z).applyMatrix4(
      matrix,
    ),
  );
}

/**
 * Lays points in a grid of Counts along Size, centered on the origin, then
 * moved by the blocks around this line.
 *
 * @param run Running line.
 * @returns Positions.
 */
function solidScriptScatterGrid(run: SolidScriptBlockRun): THREE.Vector3[] {
  const size = solidScriptScatterSize(run);
  const counts = solidScriptScatterCounts(run);
  const matrix = run.matrix();
  const points: THREE.Vector3[] = [];
  for (let z = 0; z < counts.z; z++)
    for (let y = 0; y < counts.y; y++)
      for (let x = 0; x < counts.x; x++)
        points.push(solidScriptScatterGridPoint(size, counts, x, y, z).applyMatrix4(matrix));
  return points;
}

/**
 * Reads how many points to spread, 0 to 10000.
 *
 * @param run Running line.
 * @returns Count.
 */
function solidScriptScatterCount(run: SolidScriptBlockRun): number {
  const count = solidScriptValueNumber(run.value('count'));
  if (count === undefined || !Number.isInteger(count) || count < 0 || count > 10000)
    throw new Error('Count needs a whole number from 0 to 10000');
  return count;
}

/**
 * Reads the seed that keeps a random scatter the same.
 *
 * @param run Running line.
 * @returns Seed.
 */
function solidScriptScatterSeed(run: SolidScriptBlockRun): number {
  const seed = solidScriptValueNumber(run.value('seed'));
  if (seed === undefined) throw new Error('Seed needs a number');
  return seed;
}

/**
 * Reads the box Size, three lengths in metres of 0 or more.
 *
 * @param run Running line.
 * @returns Size.
 */
function solidScriptScatterSize(run: SolidScriptBlockRun): THREE.Vector3 {
  const size = solidScriptScatterVector(run.value('size'));
  if (!size || size.x < 0 || size.y < 0 || size.z < 0)
    throw new Error('Size needs three sizes in metres, 0 or more, such as 1, 1, 1');
  return size;
}

/**
 * Reads how many grid points stand along X, Y and Z.
 *
 * @param run Running line.
 * @returns Counts.
 */
function solidScriptScatterCounts(run: SolidScriptBlockRun): THREE.Vector3 {
  const counts = solidScriptScatterVector(run.value('counts'));
  if (!counts || !solidScriptScatterCountsFit(counts))
    throw new Error(
      'Counts needs three whole numbers from 1 to 100, and at most 10000 points in all when they are multiplied',
    );
  return counts;
}

/**
 * Tells whether grid Counts stay in range and make at most 10000 points.
 *
 * @param counts Counts along X, Y and Z.
 * @returns True when they fit.
 */
function solidScriptScatterCountsFit(counts: THREE.Vector3): boolean {
  const axes = [counts.x, counts.y, counts.z];
  return (
    axes.every((count) => Number.isInteger(count) && count >= 1 && count <= 100) &&
    counts.x * counts.y * counts.z <= 10000
  );
}

/**
 * Reads a three-number vector field.
 *
 * @param value Field value.
 * @returns Vector, or undefined when it is not three numbers.
 */
function solidScriptScatterVector(value: SolidScriptValue): THREE.Vector3 | undefined {
  const numbers = solidScriptValueNumbers(value);
  const x = numbers?.[0];
  const y = numbers?.[1];
  const z = numbers?.[2];
  if (!numbers || numbers.length !== 3 || x === undefined || y === undefined || z === undefined) return undefined;
  return new THREE.Vector3(x, y, z);
}

/**
 * One point of a grid, in local space, with the first and last on the faces of
 * the box when a count is at least 2, or the center when it is 1.
 *
 * @param size Box size.
 * @param counts Points along each axis.
 * @param x Index along X.
 * @param y Index along Y.
 * @param z Index along Z.
 * @returns Local point.
 */
function solidScriptScatterGridPoint(
  size: THREE.Vector3,
  counts: THREE.Vector3,
  x: number,
  y: number,
  z: number,
): THREE.Vector3 {
  const along = (count: number, index: number, length: number): number =>
    count === 1 ? 0 : (index / (count - 1) - 0.5) * length;
  return new THREE.Vector3(along(counts.x, x, size.x), along(counts.y, y, size.y), along(counts.z, z, size.z));
}

/** A tetrahedron used to fill a brush, with its volume as weight. */
interface SolidScriptScatterPiece {
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  weight: number;
}

/**
 * Groups Inside targets by the brush or mesh they belong to.
 *
 * @param faces Faces.
 * @returns Faces of each shape.
 */
function solidScriptScatterGroups(faces: readonly SolidScriptFaceFacts[]): SolidScriptFaceFacts[][] {
  const groups = new Map<object, SolidScriptFaceFacts[]>();
  for (const face of faces) {
    const known = groups.get(face.leaf) ?? [];
    known.push(face);
    groups.set(face.leaf, known);
  }
  return [...groups.values()];
}

/**
 * Fills a solid with tetrahedra from its middle to each face triangle.
 *
 * @param faces Faces of one solid.
 * @returns Pieces.
 */
function solidScriptScatterPieces(faces: readonly SolidScriptFaceFacts[]): SolidScriptScatterPiece[] {
  const origin = solidScriptScatterCenter(faces);
  const pieces: SolidScriptScatterPiece[] = [];
  for (const face of faces)
    for (let corner = 1; corner + 1 < face.corners.length; corner++) {
      const a = face.corners[0];
      const b = face.corners[corner];
      const c = face.corners[corner + 1];
      if (!a || !b || !c) continue;
      const weight = solidScriptScatterTetVolume(origin, a, b, c);
      if (weight > 1e-18) pieces.push({ corners: [origin, a, b, c], weight });
    }
  return pieces;
}

/**
 * Middle of the unique corners of some faces.
 *
 * @param faces Faces.
 * @returns Center.
 */
function solidScriptScatterCenter(faces: readonly SolidScriptFaceFacts[]): THREE.Vector3 {
  const seen: THREE.Vector3[] = [];
  for (const face of faces)
    for (const corner of face.corners)
      if (!seen.some((point) => point.distanceToSquared(corner) < 1e-16)) seen.push(corner);
  const center = new THREE.Vector3();
  for (const point of seen) center.add(point);
  return seen.length === 0 ? center : center.multiplyScalar(1 / seen.length);
}

/**
 * Volume of a tetrahedron.
 *
 * @param origin First corner.
 * @param a Second corner.
 * @param b Third corner.
 * @param c Fourth corner.
 * @returns Volume, never negative.
 */
function solidScriptScatterTetVolume(
  origin: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
): number {
  return (
    Math.abs(
      new THREE.Vector3()
        .subVectors(a, origin)
        .dot(new THREE.Vector3().subVectors(b, origin).cross(new THREE.Vector3().subVectors(c, origin))),
    ) / 6
  );
}

/**
 * Picks the piece whose running weight first reaches the target.
 *
 * @param pieces Weighted pieces.
 * @param target Value from 0 to the total weight.
 * @returns That piece's corners.
 */
function solidScriptScatterWeighted(
  pieces: readonly SolidScriptScatterPiece[],
  target: number,
): [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  let reach = 0;
  let last = pieces[0];
  for (const piece of pieces) {
    reach += piece.weight;
    last = piece;
    if (reach >= target) return piece.corners;
  }
  if (!last)
    throw new Error('Inside needs a brush or mesh with some volume in Of; a flat shape has no inside to scatter in');
  return last.corners;
}

/**
 * A uniform random point inside a tetrahedron.
 *
 * @param corners The four corners.
 * @param random Next unit random number.
 * @returns Point.
 */
function solidScriptScatterTetPoint(
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3],
  random: () => number,
): THREE.Vector3 {
  const [first, second, third, fourth] = corners;
  const weights = [
    solidScriptScatterSpace(random()),
    solidScriptScatterSpace(random()),
    solidScriptScatterSpace(random()),
    solidScriptScatterSpace(random()),
  ] as const;
  const total = weights[0] + weights[1] + weights[2] + weights[3];
  return new THREE.Vector3()
    .addScaledVector(first, weights[0] / total)
    .addScaledVector(second, weights[1] / total)
    .addScaledVector(third, weights[2] / total)
    .addScaledVector(fourth, weights[3] / total);
}

/**
 * Turns a unit random number into a spacing used to pick uniformly in a
 * tetrahedron.
 *
 * @param unit Number from 0 to 1.
 * @returns Positive spacing.
 */
function solidScriptScatterSpace(unit: number): number {
  return -Math.log(Math.min(1 - 1e-12, Math.max(1e-12, unit)));
}

/**
 * Random numbers 0..1, the same sequence for the same seed. Kept for Inside and
 * In Box only; On Faces keeps its own, so existing layouts do not move.
 *
 * @param seed Seed.
 * @returns Next number.
 */
function solidScriptScatterRng(seed: number): () => number {
  let state = (Math.floor(seed * 1000) ^ 0x6d2b79f5) >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
