import { solidScriptNoiseWord } from './solid_script_functions_noise.js';
import { solidScriptExtraNumber, solidScriptExtraSeeded } from './solid_script_functions_extra.js';
import { solidScriptMemberRound } from './solid_script_members.js';
import { solidScriptValueNumbers, type SolidScriptValue } from './solid_script_value.js';

/** Arguments of a procedural texture. */
type SolidScriptTextureArgs = readonly SolidScriptValue[];

/**
 * Reads a scaled texture position, multiplying each coordinate by Scale.
 *
 * @param args Position and optional Scale.
 * @param usage Function name used in errors.
 * @returns Coordinates in texture space.
 */
function solidScriptTexturePosition(args: SolidScriptTextureArgs, usage: string): number[] {
  const position = solidScriptValueNumbers(args[0]);
  if (position?.length !== 3) throw new Error(`${usage} needs a position vector of three numbers`);
  const scale = solidScriptTextureNumber(args, 1, 1, usage);
  return position.map((value) => value * scale);
}

/**
 * Reads an optional numeric texture parameter.
 *
 * @param args Function arguments.
 * @param index Parameter index.
 * @param fallback Value when omitted.
 * @param usage Function name used in errors.
 * @returns Numeric parameter.
 */
function solidScriptTextureNumber(
  args: SolidScriptTextureArgs,
  index: number,
  fallback: number,
  usage: string,
): number {
  return args.length > index ? solidScriptExtraNumber(args, index, usage) : fallback;
}

/**
 * Measures how far a coordinate lies from the nearest edge of its cell along
 * one axis: the cell part is wrapped to 0..1 and folded about its middle.
 *
 * @param coordinate Coordinate.
 * @param size Cell size.
 * @returns Distance to the nearest cell edge.
 */
function solidScriptTextureEdgeDistance(coordinate: number, size: number): number {
  const part = coordinate / size - Math.floor(coordinate / size);
  return size * (0.5 - Math.abs(part - 0.5));
}

/**
 * Measures distance to the nearest joint of a staggered rectangular grid.
 *
 * @param position Scaled coordinates.
 * @param args Brick parameters.
 * @returns Distance and integer cell coordinates.
 */
function solidScriptTextureBrickCell(position: readonly number[], args: SolidScriptTextureArgs): number[] {
  const width = solidScriptTextureNumber(args, 5, 0.5, 'Brick');
  const height = solidScriptTextureNumber(args, 6, 0.25, 'Brick');
  const offset = solidScriptTextureNumber(args, 7, 0.5, 'Brick');
  if (width <= 0 || height <= 0) throw new Error('Brick needs Width and Height greater than 0');
  const y = position[1] ?? 0;
  const row = Math.floor(y / height);
  const x = (position[0] ?? 0) + (row % 2 === 0 ? offset * width : 0);
  const distance = Math.min(solidScriptTextureEdgeDistance(x, width), solidScriptTextureEdgeDistance(y, height));
  return [distance, Math.floor(x / width), row];
}

/**
 * Gives how much mortar lies at a distance from the nearest joint: full up to
 * the solid core of the gap, none from Mortar on, and an S-shaped fall in
 * between whose width is Smooth's share of the gap.
 *
 * @param distance Distance to the nearest joint.
 * @param mortar Gap size.
 * @param smooth Share of the gap that fades, from 0 to 1.
 * @returns Mortar amount from 0 to 1.
 */
function solidScriptTextureMortar(distance: number, mortar: number, smooth: number): number {
  const core = mortar * (1 - smooth);
  if (distance >= mortar) return 0;
  if (distance <= core) return 1;
  const fall = (distance - core) / (mortar - core);
  return solidScriptMemberRound(1 - fall * fall * (3 - 2 * fall));
}

/**
 * Samples joints or a constant random tint on a staggered brick grid.
 *
 * @param args Position, Scale, Seed, Output, Mortar, Width, Height, Offset and
 *   Smooth.
 * @returns Joint factor or brick tint.
 */
function solidScriptTextureBrick(args: SolidScriptTextureArgs): number {
  const [distance = 0, column = 0, row = 0] = solidScriptTextureBrickCell(
    solidScriptTexturePosition(args, 'Brick'),
    args,
  );
  const seed = solidScriptTextureNumber(args, 2, 0, 'Brick');
  const output = solidScriptNoiseWord(args[3], ['Mortar', 'Tint'], 'Brick Output');
  if (output === 'Tint') return solidScriptExtraSeeded(seed + column * 73856093 + row * 19349663);
  const mortar = solidScriptTextureNumber(args, 4, 0.02, 'Brick');
  const smooth = solidScriptTextureNumber(args, 8, 0.1, 'Brick');
  if (mortar < 0 || smooth < 0 || smooth > 1) throw new Error('Brick needs Mortar >= 0 and Smooth from 0 to 1');
  return solidScriptTextureMortar(distance, mortar, smooth);
}

/**
 * Folds one colour swirl through the next: channel roles rotate each stage,
 * with alternating sine and cosine waves.
 *
 * @param wave Three channels from the previous stage.
 * @param stage Stage number, from 0.
 * @param bend How strongly the waves bend.
 * @returns Folded channels, from -1 to 1.
 */
function solidScriptTextureSwirl(wave: readonly number[], stage: number, bend: number): number[] {
  return [0, 1, 2].map((axis) => {
    const forward = wave[(axis + 1) % 3] ?? 0;
    const back = wave[(axis + 2) % 3] ?? 0;
    const angle = (wave[axis] ?? 0) + bend * (forward - back * 0.5) + (axis + 1) * (stage + 1) * 0.7;
    return stage % 2 === 0 ? Math.sin(angle) : Math.cos(angle);
  });
}

/**
 * Swirling colour bands made by feeding waves through one another, with the
 * channel roles rotating each time.
 *
 * @param args Position, Scale, Depth and Distortion.
 * @returns Three colour values from 0 to 1.
 */
function solidScriptTextureMagic(args: SolidScriptTextureArgs): number[] {
  const usage = 'Magic(position, scale, depth, distortion)';
  const [x = 0, y = 0, z = 0] = solidScriptTexturePosition(args, usage);
  const depth = solidScriptTextureNumber(args, 2, 2, usage);
  const bend = solidScriptTextureNumber(args, 3, 1, usage);
  if (!Number.isInteger(depth) || depth < 0 || depth > 10) throw new Error(`${usage} needs a whole Depth from 0 to 10`);
  let wave = [Math.sin(x * 2.3 + y * 0.9), Math.cos(y * 3.1 + z * 1.3), Math.sin(z * 2.7 - x * 1.1)];
  for (let stage = 0; stage < depth; stage++) wave = solidScriptTextureSwirl(wave, stage, bend);
  return wave.map((value) => solidScriptMemberRound(value * 0.5 + 0.5));
}

/** Kinds of Gradient, by the shape it fades in. */
const SOLID_SCRIPT_TEXTURE_GRADIENTS = {
  Linear: ([x = 0]: number[]) => x,
  Quadratic: ([x = 0]: number[]) => Math.max(x, 0) ** 2,
  Easing: ([x = 0]: number[]) => {
    const t = Math.min(1, Math.max(0, x));
    return t * t * (3 - 2 * t);
  },
  Diagonal: ([x = 0, y = 0]: number[]) => (x + y) / 2,
  Spherical: (position: number[]) => Math.max(1 - Math.hypot(...position), 0),
  'Quadratic Sphere': (position: number[]) => Math.max(1 - Math.hypot(...position), 0) ** 2,
  Radial: ([x = 0, y = 0]: number[]) => Math.atan2(y, x) / (2 * Math.PI) + 0.5,
} as const;

/**
 * Samples a gradient that fades from 0 to 1 across space.
 *
 * @param args Position and Type.
 * @returns Value from 0 to 1.
 */
function solidScriptTextureGradient(args: SolidScriptTextureArgs): number {
  const position = solidScriptValueNumbers(args[0]);
  if (position?.length !== 3) throw new Error('Gradient needs a position vector of three numbers');
  const kinds = Object.keys(SOLID_SCRIPT_TEXTURE_GRADIENTS) as (keyof typeof SOLID_SCRIPT_TEXTURE_GRADIENTS)[];
  const kind = solidScriptNoiseWord(args[1], kinds, 'Gradient Type');
  const value = SOLID_SCRIPT_TEXTURE_GRADIENTS[kind](position);
  return solidScriptMemberRound(Math.min(1, Math.max(0, value)));
}

/** Texture functions returning scalar fields or colour vectors. */
export const SOLID_SCRIPT_FUNCTIONS_TEXTURE = {
  brick: solidScriptTextureBrick,
  magic: solidScriptTextureMagic,
  gradient: solidScriptTextureGradient,
};
