import * as THREE from 'three';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import type { SolidScriptFaceFacts } from './solid_script_geometry.js';
import { solidScriptGeometryFacesOutside } from './solid_script_geometry_outside.js';
import { SolidScriptPoint, solidScriptValueNumber, type SolidScriptValue } from './solid_script_value.js';
import {
  SOLID_SCRIPT_SCATTER_MOST,
  solidScriptScatterByCount,
  solidScriptScatterByDensity,
  solidScriptScatterRandom,
  solidScriptScatterRound,
  solidScriptScatterSpacer,
  solidScriptScatterTake,
} from './solid_script_scatter_spread.js';
import {
  solidScriptScatterGroups,
  solidScriptScatterPieces,
  solidScriptScatterTetPoint,
  solidScriptScatterWeighted,
} from './solid_script_scatter_inside.js';
import { solidScriptVectorThree } from './solid_script_vector.js';

/** Where Scatter Points can put its points. */
export const SOLID_SCRIPT_SCATTER_ON = ['On Faces', 'Inside', 'In Box', 'Grid'] as const;

/** How Scatter Points decides how many points to give. */
export const SOLID_SCRIPT_SCATTER_BY = ['Count', 'Density'] as const;

/** One of the On words. */
export type SolidScriptScatterOn = (typeof SOLID_SCRIPT_SCATTER_ON)[number];

/** Reads the Density of each face, given the faces Scatter Points works on. */
export type SolidScriptScatterDensity = (
  faces: readonly SolidScriptFaceFacts[],
) => (face: SolidScriptFaceFacts) => number;

/** Points Scatter Points writes, and face directions when it is On Faces. */
export interface SolidScriptScatterResult {
  positions: THREE.Vector3[];
  normals: THREE.Vector3[] | null;
}

/**
 * Spreads points the way the On field says: on faces, inside brushes, in a box,
 * or on a grid.
 *
 * @param run Running line.
 * @param faces Faces or brushes in Of, read only when that On needs them.
 * @param densityOf Reads Density per face, for On Faces By Density.
 * @returns Positions, and Normals for Faces.
 */
export function solidScriptScatterRun(
  run: SolidScriptBlockRun,
  faces: () => readonly SolidScriptFaceFacts[],
  densityOf: SolidScriptScatterDensity,
): SolidScriptScatterResult {
  if (run.text('into').trim() === '') throw new Error('Scatter Points needs a variable in Into for the points');
  const on = solidScriptScatterOn(run);
  if (on === 'On Faces') return solidScriptScatterOnFaces(run, faces(), densityOf);
  if (on === 'Inside') return { positions: solidScriptScatterInside(run, faces()), normals: null };
  if (on === 'In Box') return { positions: solidScriptScatterInBox(run), normals: null };
  return { positions: solidScriptScatterGrid(run), normals: null };
}

/**
 * Reads On, or On Faces when the field is empty.
 *
 * @param run Running line.
 * @returns On word.
 */
export function solidScriptScatterOn(run: SolidScriptBlockRun): SolidScriptScatterOn {
  const text = run.text('on').trim() || 'On Faces';
  const match = SOLID_SCRIPT_SCATTER_ON.find((word) => word.toLowerCase() === text.toLowerCase());
  if (!match) throw new Error(`On needs On Faces, Inside, In Box or Grid, not ${text}`);
  return match;
}

/**
 * Tells whether By asks for Density rather than a Count; empty means Count.
 *
 * @param run Running line.
 * @returns True for Density.
 */
function solidScriptScatterByDensityWanted(run: SolidScriptBlockRun): boolean {
  const text = run.text('by').trim() || 'Count';
  const match = SOLID_SCRIPT_SCATTER_BY.find((word) => word.toLowerCase() === text.toLowerCase());
  if (!match) throw new Error(`By needs Count or Density, not ${text}`);
  return match === 'Density';
}

/**
 * Spreads points on faces, by Count (more on bigger faces) or by Density per
 * face. Same seed, same points. Faces back to back against another brush in Of,
 * inside the shape, get none.
 *
 * @param run Running line.
 * @param faces Faces.
 * @param densityOf Reads Density per face.
 * @returns Positions and the way each face looks.
 */
function solidScriptScatterOnFaces(
  run: SolidScriptBlockRun,
  faces: readonly SolidScriptFaceFacts[],
  densityOf: SolidScriptScatterDensity,
): SolidScriptScatterResult {
  const outside = solidScriptGeometryFacesOutside(faces);
  const seed = solidScriptScatterSeed(run);
  const spacing = solidScriptScatterSpacing(run);
  const points = solidScriptScatterByDensityWanted(run)
    ? solidScriptScatterByDensity(outside, densityOf(outside), seed, spacing)
    : solidScriptScatterByCount(outside, solidScriptScatterCount(run), seed, spacing);
  return { positions: points.map((point) => point.position), normals: points.map((point) => point.face.normal) };
}

/**
 * How many points a volume gets: Count, or the volume times Density rounded at
 * random.
 *
 * @param run Running line.
 * @param volume Cubic metres.
 * @param random Next unit random number.
 * @returns Points wanted.
 */
function solidScriptScatterAmount(run: SolidScriptBlockRun, volume: number, random: () => number): number {
  if (!solidScriptScatterByDensityWanted(run)) return solidScriptScatterCount(run);
  const density = solidScriptValueNumber(run.value('density'));
  if (density === undefined) throw new Error('Density needs a number of points per cubic metre, such as 10');
  const count = solidScriptScatterRound(volume * Math.max(0, density), random);
  if (count > SOLID_SCRIPT_SCATTER_MOST)
    throw new Error(`Density gives more than ${SOLID_SCRIPT_SCATTER_MOST} points; use a lower Density`);
  return count;
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
    throw new Error('Inside needs an object with some volume in Of; a flat shape has no inside to scatter in');
  const random = solidScriptScatterRandom(solidScriptScatterSeed(run));
  const count = solidScriptScatterAmount(run, total, random);
  const next = (): THREE.Vector3 =>
    solidScriptScatterTetPoint(solidScriptScatterWeighted(pieces, random() * total), random);
  return solidScriptScatterTake(
    count,
    next,
    (point) => point,
    solidScriptScatterSpacer(solidScriptScatterSpacing(run)),
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
  const random = solidScriptScatterRandom(solidScriptScatterSeed(run));
  const matrix = run.matrix();
  const count = solidScriptScatterAmount(run, size.x * size.y * size.z, random);
  const next = (): THREE.Vector3 =>
    new THREE.Vector3((random() - 0.5) * size.x, (random() - 0.5) * size.y, (random() - 0.5) * size.z).applyMatrix4(
      matrix,
    );
  return solidScriptScatterTake(
    count,
    next,
    (point) => point,
    solidScriptScatterSpacer(solidScriptScatterSpacing(run)),
  );
}

/**
 * Reads Spacing, the smallest distance between points: 0 or more metres.
 *
 * @param run Running line.
 * @returns Spacing.
 */
function solidScriptScatterSpacing(run: SolidScriptBlockRun): number {
  const spacing = solidScriptValueNumber(run.value('spacing'));
  if (spacing === undefined || spacing < 0) throw new Error('Spacing needs metres of 0 or more, such as 0.5');
  return spacing;
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
 * Reads a vector field.
 *
 * @param value Field value.
 * @returns Vector, or undefined when it is not three numbers.
 */
function solidScriptScatterVector(value: SolidScriptValue): THREE.Vector3 | undefined {
  return solidScriptVectorThree(value);
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

/**
 * Gives each point a steady id from where it lies, to a hundredth of a
 * millimetre, so a point keeps its id when others are added or taken away.
 *
 * @param positions Points.
 * @returns Whole numbers from 0, one per point.
 */
export function solidScriptScatterIds(positions: readonly THREE.Vector3[]): number[] {
  return positions.map((point) => {
    let hash = 0x811c9dc5;
    for (const axis of [point.x, point.y, point.z]) {
      hash = Math.imul(hash ^ Math.round(axis * 1e5), 0x01000193);
      hash ^= hash >>> 13;
    }
    return (hash >>> 0) % 2147483647;
  });
}

/**
 * Reads the Keep chance of one scattered point, a number from 0 to 1.
 *
 * @param run Running line.
 * @param point The point.
 * @param index Its number from 0.
 * @param count How many points were scattered.
 * @returns Chance.
 */
function solidScriptScatterKeepChance(
  run: SolidScriptBlockRun,
  point: THREE.Vector3,
  index: number,
  count: number,
): number {
  const value = run.valueWith('keep', { $Point: new SolidScriptPoint(point.toArray()), $Index: index, $Count: count });
  const chance = solidScriptValueNumber(value);
  if (chance === undefined || !(chance >= 0 && chance <= 1))
    throw new Error('Keep needs a chance from 0 to 1 per point, such as 0.5 or [=Max(0, [$Point.Normal.Y])]');
  return chance;
}

/**
 * Thins scattered points by their 🔁 Keep chance. Each point draws one steady
 * number from its Id and the Seed and stays when that number is below its
 * chance, so raising the chance only ever adds points.
 *
 * @param run Running line.
 * @param found Scattered points.
 * @returns Points that stay, with their face directions.
 */
export function solidScriptScatterKeep(
  run: SolidScriptBlockRun,
  found: SolidScriptScatterResult,
): SolidScriptScatterResult {
  const seed = solidScriptScatterSeed(run);
  const ids = solidScriptScatterIds(found.positions);
  const stays = found.positions.map((point, index) => {
    const chance = solidScriptScatterKeepChance(run, point, index, found.positions.length);
    const draw = Math.imul((ids[index] ?? 0) ^ Math.imul(Math.round(seed * 1000) + 1, 0x9e3779b1), 0x85ebca6b) >>> 0;
    return ((draw ^ (draw >>> 15)) >>> 0) / 4294967296 < chance;
  });
  return {
    positions: found.positions.filter((_, index) => stays[index]),
    normals: found.normals?.filter((_, index) => stays[index]) ?? null,
  };
}
