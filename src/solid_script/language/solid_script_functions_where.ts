import * as THREE from 'three';
import { solidScriptExtraNumber, solidScriptExtraSeeded } from './solid_script_functions_extra.js';
import {
  solidScriptValueNumbers,
  solidScriptValueVectorsMatched,
  type SolidScriptValue,
} from './solid_script_value.js';
import { solidScriptRotationDegrees } from './solid_script_transforms.js';
import { solidScriptVectorRead, solidScriptVectorThree } from './solid_script_vector.js';

/** Built-in function implementation over evaluated positional arguments. */
type SolidScriptBuiltin = (args: SolidScriptValue[]) => SolidScriptValue;

/**
 * A number from 0 up to 1 for an ID and a Seed: the same pair always gives the
 * same number, and Seed 0 gives what the ID alone gives.
 *
 * @param id Which item asks.
 * @param seed Stream; another seed gives numbers that do not follow these.
 * @returns Number from 0 up to 1.
 */
export function solidScriptWhereRandom(id: number, seed: number): number {
  return solidScriptExtraSeeded(seed === 0 ? id : id + solidScriptExtraSeeded(seed) * 1e6);
}

/**
 * Reads an optional number input, 0 when left off.
 *
 * @param args Arguments.
 * @param index Input position.
 * @param usage How to call the function, for the message.
 * @returns Number.
 */
function solidScriptWhereOptional(args: readonly SolidScriptValue[], index: number, usage: string): number {
  return args.length > index ? solidScriptExtraNumber(args, index, usage) : 0;
}

/**
 * Mixes two numbers or two vectors of the same size.
 *
 * @param from Value at 0.
 * @param to Value at 1.
 * @param amount How far from From toward To, per component.
 * @param usage How to call the function, for the message.
 * @returns Number or vector.
 */
function solidScriptWhereMix(
  from: SolidScriptValue,
  to: SolidScriptValue,
  amount: (axis: number) => number,
  usage: string,
): SolidScriptValue {
  const given = [from, to].map((value) =>
    typeof value === 'number' ? [value] : (solidScriptValueNumbers(value) ?? []),
  );
  const [low = [], high = []] = solidScriptValueVectorsMatched(...given);
  if (low.length !== high.length || low.length === 0)
    throw new Error(`${usage} needs two numbers, or two vectors of the same size`);
  const mixed = low.map((start, axis) => start + ((high[axis] ?? start) - start) * amount(axis));
  return Array.isArray(from) || Array.isArray(to) ? mixed : mixed[0];
}

/**
 * A direction one unit long, every way equally likely, for an ID and a Seed.
 *
 * @param id Which item asks.
 * @param seed Stream.
 * @returns Unit vector.
 */
function solidScriptWhereRandomDirection(id: number, seed: number): THREE.Vector3 {
  const height = solidScriptWhereRandom(id * 4, seed) * 2 - 1;
  const turn = solidScriptWhereRandom(id * 4 + 1, seed) * Math.PI * 2;
  const flat = Math.sqrt(1 - height * height);
  return new THREE.Vector3(flat * Math.cos(turn), height, flat * Math.sin(turn));
}

/**
 * A rotation with every orientation equally likely, for an ID and a Seed, as
 * degrees turned X then Y then Z.
 *
 * @param id Which item asks.
 * @param seed Stream.
 * @returns Degrees per axis.
 */
function solidScriptWhereRandomRotation(id: number, seed: number): number[] {
  const [lean, first, second] = [0, 1, 2].map((part) => solidScriptWhereRandom(id * 4 + part, seed)) as [
    number,
    number,
    number,
  ];
  const [low, high] = [Math.sqrt(1 - lean), Math.sqrt(lean)];
  const [a, b] = [first * Math.PI * 2, second * Math.PI * 2];
  const turn = new THREE.Quaternion(low * Math.sin(a), low * Math.cos(a), high * Math.sin(b), high * Math.cos(b));
  return solidScriptRotationDegrees(new THREE.Matrix4().makeRotationFromQuaternion(turn));
}

/**
 * The functions of the Where helpers that are not checks: Random, Chance,
 * RandomDirection, RandomRotation, RandomInt, Spread and Along. A per-item
 * field fills in their ID or Index and Count.
 */
export const SOLID_SCRIPT_FUNCTIONS_WHERE = {
  random: (args) => {
    const usage = 'Random(min, max, id, seed)';
    const id = solidScriptWhereOptional(args, 2, usage);
    const seed = solidScriptWhereOptional(args, 3, usage);
    return solidScriptWhereMix(args[0], args[1], (axis) => solidScriptWhereRandom(id + axis, seed), usage);
  },
  chance: (args) => {
    const usage = 'Chance(probability, id, seed)';
    const probability = solidScriptExtraNumber(args, 0, usage);
    return (
      solidScriptWhereRandom(solidScriptWhereOptional(args, 1, usage), solidScriptWhereOptional(args, 2, usage)) <
      probability
    );
  },
  random_direction: (args) => {
    const usage = 'RandomDirection(id, seed)';
    const way = solidScriptWhereRandomDirection(
      solidScriptWhereOptional(args, 0, usage),
      solidScriptWhereOptional(args, 1, usage),
    );
    return [way.x, way.y, way.z];
  },
  random_rotation: (args) => {
    const usage = 'RandomRotation(id, seed)';
    return solidScriptWhereRandomRotation(
      solidScriptWhereOptional(args, 0, usage),
      solidScriptWhereOptional(args, 1, usage),
    );
  },
  random_int: (args) => {
    const usage = 'RandomInt(min, max, id, seed)';
    const ends = [solidScriptExtraNumber(args, 0, usage), solidScriptExtraNumber(args, 1, usage)].map(Math.round);
    const low = Math.min(...ends);
    const span = Math.max(...ends) - low + 1;
    const id = solidScriptWhereOptional(args, 2, usage);
    const pick = Math.floor(solidScriptWhereRandom(id, solidScriptWhereOptional(args, 3, usage)) * span);
    return low + Math.min(span - 1, pick);
  },
  spread: (args) => {
    const usage = 'Spread(from, to, index, count)';
    if (args.length < 4) throw new Error(`${usage} needs an Index and a Count outside a field that changes per item`);
    const index = solidScriptExtraNumber(args, 2, usage);
    const count = solidScriptExtraNumber(args, 3, usage);
    const amount = count > 1 ? index / (count - 1) : 0;
    return solidScriptWhereMix(args[0], args[1], () => amount, usage);
  },
  along: (args) => {
    const usage = 'Along(point, direction, distance)';
    const point = solidScriptVectorRead(args[0]);
    const way = solidScriptVectorThree(args[1]);
    if (!point || !way) throw new Error(`${usage} needs a point and a direction, each a vector such as 0, 1, 0`);
    if (way.lengthSq() < 1e-18) throw new Error(`${usage} needs a direction that is not 0, 0, 0`);
    const moved = new THREE.Vector3(point[0], point[1], point[2]).addScaledVector(
      way.normalize(),
      solidScriptExtraNumber(args, 2, usage),
    );
    return [moved.x, moved.y, moved.z];
  },
} satisfies Readonly<Record<string, SolidScriptBuiltin>>;
