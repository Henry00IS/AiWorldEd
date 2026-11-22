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
  const row = Math.floor((position[1] ?? 0) / height);
  const horizontal = (position[0] ?? 0) + (row % 2 === 0 ? offset * width : 0);
  const column = Math.floor(horizontal / width);
  const x = horizontal - column * width;
  const y = (position[1] ?? 0) - row * height;
  return [Math.min(x, width - x, y, height - y), column, row];
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
  if (distance >= mortar) return 0;
  if (smooth === 0) return 1;
  const blend = Math.min(1, (1 - distance / mortar) / smooth);
  return solidScriptMemberRound(blend * blend * (3 - 2 * blend));
}

/**
 * Coefficients of successive trigonometric turbulence stages: target, signs,
 * cosine, negate.
 */
const SOLID_SCRIPT_TEXTURE_MAGIC_STAGES = [
  [1, 1, -1, 1, 1, -1],
  [0, 1, -1, -1, 1, 1],
  [2, -1, -1, -1, 0, 1],
  [0, -1, 1, -1, 1, -1],
  [1, -1, 1, 1, 0, -1],
  [1, -1, 1, 1, 1, -1],
  [0, 1, 1, 1, 1, 1],
  [2, 1, 1, -1, 0, 1],
  [0, -1, -1, 1, 1, -1],
  [1, 1, -1, 1, 0, -1],
] as const;

/**
 * Samples a three-channel trigonometric turbulence texture.
 *
 * @param args Position, Scale, Depth and Distortion.
 * @returns Three colour channels; their mean is the factor.
 */
function solidScriptTextureMagic(args: SolidScriptTextureArgs): number[] {
  const [x = 0, y = 0, z = 0] = solidScriptTexturePosition(args, 'Magic');
  const depth = solidScriptTextureNumber(args, 2, 2, 'Magic');
  const distortion = solidScriptTextureNumber(args, 3, 1, 'Magic');
  if (depth < 0 || depth > 10 || depth !== Math.floor(depth)) throw new Error('Magic needs Depth from 0 to 10');
  const channels = [Math.sin(5 * (x + y + z)), Math.cos(5 * (-x + y - z)), -Math.cos(5 * (-x - y + z))];
  if (depth > 0) channels.forEach((value, axis) => (channels[axis] = value * distortion));
  for (const [target, a, b, c, cosine, sign] of SOLID_SCRIPT_TEXTURE_MAGIC_STAGES.slice(0, depth)) {
    const phase = a * (channels[0] ?? 0) + b * (channels[1] ?? 0) + c * (channels[2] ?? 0);
    channels[target] = sign * (cosine ? Math.cos(phase) : Math.sin(phase)) * distortion;
  }
  return channels.map((value) => solidScriptMemberRound(0.5 - (distortion === 0 ? value : value / (2 * distortion))));
}

/** Texture functions returning scalar fields or colour vectors. */
export const SOLID_SCRIPT_FUNCTIONS_TEXTURE = {
  brick: solidScriptTextureBrick,
  magic: solidScriptTextureMagic,
};
