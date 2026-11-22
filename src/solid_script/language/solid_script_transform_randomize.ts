import * as THREE from 'three';
import { solidScriptWhereRandom } from './solid_script_functions_where.js';
import {
  solidScriptTransformAboutCenter,
  solidScriptTransformWorld,
  type SolidScriptTransformWorldOf,
} from './solid_script_transform_apply.js';
import { solidScriptOffsetMatrix, solidScriptRotationDegreesMatrix } from './solid_script_transforms.js';
import type { SolidScriptBlockArguments } from './solid_script_block_arguments.js';

/**
 * How many random numbers one item of Randomize draws: 3 moves, 3 turns, 1
 * scale.
 */
const SOLID_SCRIPT_RANDOMIZE_DRAWS = 7;

/**
 * Draws the random numbers of one item, each from -1 up to 1 except the last,
 * the scale share, from 0 up to 1.
 *
 * @param args Fields of the item.
 * @returns Seven numbers.
 */
function solidScriptRandomizeDraws(args: SolidScriptBlockArguments): number[] {
  const id = Math.round(args.number('id', 0));
  const seed = args.number('seed', 0);
  return Array.from({ length: SOLID_SCRIPT_RANDOMIZE_DRAWS }, (_, draw) => {
    const share = solidScriptWhereRandom(id * SOLID_SCRIPT_RANDOMIZE_DRAWS + draw, seed);
    return draw === SOLID_SCRIPT_RANDOMIZE_DRAWS - 1 ? share : share * 2 - 1;
  });
}

/**
 * Reads the Scale range of Randomize: one number for a fixed size, or the
 * smallest and biggest, both above 0.
 *
 * @param args Fields of the item.
 * @returns Smallest and biggest factor.
 */
function solidScriptRandomizeScale(args: SolidScriptBlockArguments): [number, number] {
  const [low = 1, high = 1] = args.vector('scale', [1, 1]);
  if (!(low > 0 && high > 0))
    throw new Error('Scale needs factors above 0, the smallest and the biggest, such as 0.8, 1.2');
  return [Math.min(low, high), Math.max(low, high)];
}

/**
 * Moves, turns and scales one item by random amounts within the ranges of
 * Randomize: Move and Turn up to that far either way on each axis, and one
 * Scale factor between the two given, about the item's own center. The same ID
 * and Seed always give the same change.
 *
 * @param run Running line.
 * @param picked The item.
 * @param args Fields of the item.
 * @returns Transform.
 */
export const solidScriptTransformRandomize: SolidScriptTransformWorldOf = (run, picked, args) => {
  const draws = solidScriptRandomizeDraws(args);
  const move = args.vector('move', [0, 0, 0]).map((most, axis) => most * (draws[axis] ?? 0));
  const turn = args.vector('turn', [0, 0, 0]).map((most, axis) => most * (draws[axis + 3] ?? 0));
  const [low, high] = solidScriptRandomizeScale(args);
  const factor = low + (high - low) * (draws[6] ?? 0);
  const local = solidScriptRotationDegreesMatrix(turn).multiply(new THREE.Matrix4().makeScale(factor, factor, factor));
  const about = solidScriptTransformAboutCenter(run, 'Randomize', picked, local);
  return solidScriptTransformWorld(run.matrix(), solidScriptOffsetMatrix(move)).multiply(about);
};
