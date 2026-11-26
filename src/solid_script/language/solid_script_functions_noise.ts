import {
  solidScriptExtraNoise,
  solidScriptExtraNumber,
  solidScriptExtraSeeded,
} from './solid_script_functions_extra.js';
import { solidScriptValueText, type SolidScriptValue } from './solid_script_value.js';
import { solidScriptVectorRequire } from './solid_script_vector.js';

/** A built-in function over evaluated arguments. */
type SolidScriptNoiseFunction = (args: SolidScriptValue[]) => SolidScriptValue;

/**
 * Kinds of Noise: plain smooth bumps, sharp ridges, or terrain with flat
 * valleys.
 */
export const SOLID_SCRIPT_NOISE_TYPES = ['Smooth', 'Ridged', 'Terrain'] as const;

/**
 * What Voronoi gives: distance to the nearest point, closeness to an edge, or a
 * value per cell.
 */
export const SOLID_SCRIPT_VORONOI_OUTPUTS = ['Distance', 'Edge', 'Cell'] as const;

/** Most layers Detail adds. */
const SOLID_SCRIPT_NOISE_DETAIL_MAX = 15;

/** How a noise field is read: where, how big and which seed. */
interface SolidScriptNoiseAt {
  point: [number, number, number];
  seed: number;
}

/**
 * Reads the position, scale and seed every noise function starts with.
 *
 * @param args Arguments.
 * @param usage How to call the function, for the message.
 * @returns Point in noise space and the seed.
 */
function solidScriptNoiseAt(args: readonly SolidScriptValue[], usage: string): SolidScriptNoiseAt {
  const position = solidScriptVectorRequire(
    args[0],
    `${usage} needs a position vector first; try ${usage.split('(')[0]}(Vector(x, y, z), scale, seed)`,
  );
  const scale = args.length > 1 ? solidScriptExtraNumber(args, 1, usage) : 1;
  if (!(scale > 0)) throw new Error(`${usage} needs a scale greater than 0; try 1`);
  const seed = args.length > 2 ? solidScriptExtraNumber(args, 2, usage) : 0;
  const [x, y, z] = position;
  return { point: [x / scale, y / scale, z / scale], seed };
}

/**
 * Reads a word from a few.
 *
 * @param value Argument, or none for the first word.
 * @param words Words it may be.
 * @param usage How to call the function, for the message.
 * @returns The word.
 */
export function solidScriptNoiseWord<T extends string>(value: SolidScriptValue, words: readonly T[], usage: string): T {
  if (value === undefined) return words[0] as T;
  const text = solidScriptValueText(value).trim().toLowerCase();
  const word = words.find((entry) => entry.toLowerCase() === text);
  if (!word)
    throw new Error(
      `${usage} takes ${words.slice(0, -1).join(', ')} or ${words.at(-1) ?? ''}, not "${solidScriptValueText(value)}"`,
    );
  return word;
}

/**
 * One layer of noise, shaped by the type.
 *
 * @param at Point and seed.
 * @param layer Layer number, which also shifts the seed.
 * @param type Noise type.
 * @returns Number from 0 to 1.
 */
function solidScriptNoiseLayer(at: SolidScriptNoiseAt, layer: number, type: string): number {
  const size = 2 ** layer;
  const [x, y, z] = at.point;
  const value = solidScriptExtraNoise(x * size, y * size, z * size, at.seed + layer * 101);
  if (type !== 'Ridged') return value;
  const ridge = 1 - Math.abs(value * 2 - 1);
  return ridge * ridge;
}

/**
 * Layered noise: each layer twice as fine as the one before and Roughness times
 * as strong, blended so the result stays from 0 to 1. Terrain weighs each layer
 * by the height so far, so low ground stays smooth.
 *
 * @param at Point and seed.
 * @param detail Extra layers; a fraction blends in the last one.
 * @param roughness Strength of each layer against the one before.
 * @param type Noise type.
 * @returns Number from 0 to 1.
 */
function solidScriptNoiseLayered(at: SolidScriptNoiseAt, detail: number, roughness: number, type: string): number {
  let total = 0;
  let weight = 0;
  let strength = 1;
  for (let layer = 0; layer <= Math.ceil(detail); layer++) {
    const share = layer > detail ? detail - Math.floor(detail) : 1;
    const height = weight > 0 ? total / weight : 1;
    const amount = strength * share * (type === 'Terrain' ? Math.max(height, 0.2) : 1);
    total += solidScriptNoiseLayer(at, layer, type) * amount;
    weight += amount;
    strength *= roughness;
  }
  return weight > 0 ? Math.min(1, Math.max(0, total / weight)) : 0;
}

/**
 * Layered noise at a position.
 *
 * @param args Position, scale, seed, detail, roughness and type.
 * @returns Number from 0 to 1.
 */
function solidScriptNoise(args: readonly SolidScriptValue[]): number {
  const usage = 'Noise(position, scale, seed, detail, roughness, type)';
  const at = solidScriptNoiseAt(args, usage);
  const detail = args.length > 3 ? solidScriptExtraNumber(args, 3, usage) : 2;
  const roughness = args.length > 4 ? solidScriptExtraNumber(args, 4, usage) : 0.5;
  if (detail < 0 || roughness < 0) throw new Error(`${usage} needs a Detail and Roughness of 0 or more; try 2 and 0.5`);
  const type = solidScriptNoiseWord(args[5], SOLID_SCRIPT_NOISE_TYPES, 'Noise type');
  return solidScriptNoiseLayered(at, Math.min(detail, SOLID_SCRIPT_NOISE_DETAIL_MAX), roughness, type);
}

/** The 27 cells around and including the one a point is in. */
const SOLID_SCRIPT_VORONOI_AROUND = [-1, 0, 1].flatMap((dx) =>
  [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dz) => [dx, dy, dz] as const)),
);

/**
 * How far a point is from the random spot inside one cell, and the cell's
 * value.
 *
 * @param at Point and seed.
 * @param cell Whole-number cell corner.
 * @returns Distance and value from 0 to 1.
 */
function solidScriptVoronoiCell(at: SolidScriptNoiseAt, cell: readonly number[]): { distance: number; value: number } {
  const key = at.seed + (cell[0] ?? 0) * 73856093 + (cell[1] ?? 0) * 19349663 + (cell[2] ?? 0) * 83492791;
  const offsets = at.point.map((value, axis) => (cell[axis] ?? 0) + solidScriptExtraSeeded(key + axis * 0.317) - value);
  return { distance: Math.hypot(...offsets), value: solidScriptExtraSeeded(key + 0.911) };
}

/**
 * The nearest and second nearest cell spots around a point, with the nearest
 * cell's own value.
 *
 * @param at Point and seed.
 * @returns Distances and the value of the nearest cell.
 */
function solidScriptVoronoiNearest(at: SolidScriptNoiseAt): { first: number; second: number; cell: number } {
  const base = at.point.map(Math.floor);
  const cells = SOLID_SCRIPT_VORONOI_AROUND.map((offset) =>
    solidScriptVoronoiCell(
      at,
      base.map((value, axis) => value + (offset[axis] ?? 0)),
    ),
  ).sort((a, b) => a.distance - b.distance);
  return { first: cells[0]?.distance ?? 0, second: cells[1]?.distance ?? 0, cell: cells[0]?.value ?? 0 };
}

/** Noise functions: layered noise, three at once, and cells. */
export const SOLID_SCRIPT_FUNCTIONS_NOISE = {
  noise: solidScriptNoise,
  noise_vector: (args) => {
    const usage = 'NoiseVector(position, scale, seed)';
    const at = solidScriptNoiseAt(args, usage);
    return [0, 1, 2].map((axis) => solidScriptNoiseLayered({ ...at, seed: at.seed + axis * 7919 }, 2, 0.5, 'Smooth'));
  },
  voronoi: (args) => {
    const usage = 'Voronoi(position, scale, seed, output)';
    const nearest = solidScriptVoronoiNearest(solidScriptNoiseAt(args, usage));
    const output = solidScriptNoiseWord(args[3], SOLID_SCRIPT_VORONOI_OUTPUTS, 'Voronoi output');
    if (output === 'Edge') return nearest.second - nearest.first;
    return output === 'Cell' ? nearest.cell : nearest.first;
  },
} satisfies Readonly<Record<string, SolidScriptNoiseFunction>>;
