import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackChoices, modifierStackNumber } from '@/modifier/stack/modifier_stack_fields.js';
import { modifierStackVector } from './modifier_stack_array_math.js';

/** Smallest random scale factor, so a copy never collapses into a flat brush. */
export const MODIFIER_STACK_RANDOM_MIN_SCALE = 0.05;

/** Largest seed. */
export const MODIFIER_STACK_RANDOM_MAX_SEED = 2147483647;

/** Inspector group of the randomize fields. */
const MODIFIER_STACK_RANDOM_GROUP = 'Randomize';

/** Random channels: offset X–Z, rotation X–Z, scale X–Z, flip X–Z. */
const MODIFIER_STACK_RANDOM_CHANNEL = { offset: 0, rotation: 3, scale: 6, flip: 9 } as const;

/**
 * Returns whether randomize is on.
 *
 * @param parameters Normalized parameters.
 * @returns True when randomize is on.
 */
function modifierStackRandomOn(parameters: Record<string, unknown>): boolean {
  return parameters['randomize'] === true;
}

/**
 * Builds a randomize field shown only while randomize is on.
 *
 * @param field Field without group and visibility.
 * @param when Extra visibility condition.
 * @returns Field.
 */
function modifierStackRandomField(
  field: ModifierStackField,
  when: (parameters: Record<string, unknown>) => boolean = () => true,
): ModifierStackField {
  return {
    ...field,
    group: MODIFIER_STACK_RANDOM_GROUP,
    visible: (parameters) => modifierStackRandomOn(parameters) && when(parameters),
  };
}

/**
 * Builds three per-axis randomize fields.
 *
 * @param prefix Key stem; the axis letter is appended.
 * @param label Caption stem.
 * @param field Shared field properties.
 * @param when Extra visibility condition.
 * @returns Three fields.
 */
function modifierStackRandomAxes(
  prefix: string,
  label: string,
  field: Omit<ModifierStackField, 'key' | 'label'>,
  when?: (parameters: Record<string, unknown>) => boolean,
): ModifierStackField[] {
  return ['X', 'Y', 'Z'].map((axis) =>
    modifierStackRandomField({ ...field, key: prefix + axis, label: `${label} ${axis}` }, when),
  );
}

/** Per-axis scale randomization is chosen. */
const modifierStackRandomPerAxis = (parameters: Record<string, unknown>): boolean =>
  parameters['randomScaleAxes'] === 'axes';

/**
 * Randomize fields of the arrays that choose their count, after Blender 5's
 * Array modifier.
 */
export const MODIFIER_STACK_ARRAY_RANDOM_FIELDS: readonly ModifierStackField[] = [
  {
    key: 'randomize',
    label: 'Randomize',
    type: 'boolean',
    default: false,
    group: MODIFIER_STACK_RANDOM_GROUP,
    hint: 'Gives every copy its own random offset, rotation, scale and flip from a fixed seed.',
  },
  ...modifierStackRandomAxes('randomOffset', 'Offset', {
    type: 'number',
    default: 0,
    min: 0,
    max: 1000,
    step: 0.05,
    hint: 'Largest random move along this axis, in metres.',
  }),
  ...modifierStackRandomAxes('randomRotation', 'Rotation °', {
    type: 'number',
    default: 0,
    min: 0,
    max: 180,
    step: 1,
    hint: 'Largest random turn about this axis, in degrees.',
  }),
  modifierStackRandomField({
    key: 'randomScaleAxes',
    label: 'Scale axes',
    type: 'choice',
    default: 'uniform',
    choices: modifierStackChoices([
      ['uniform', 'Uniform'],
      ['axes', 'Axes'],
    ]),
    hint: 'Uniform scales every axis by one random factor; Axes picks one per axis.',
  }),
  modifierStackRandomField(
    {
      key: 'randomScale',
      label: 'Scale',
      type: 'number',
      default: 0,
      min: 0,
      max: 10,
      step: 0.05,
      hint: 'Largest random change of size: 0.2 scales each copy between 0.8 and 1.2.',
    },
    (parameters) => !modifierStackRandomPerAxis(parameters),
  ),
  ...modifierStackRandomAxes(
    'randomScale',
    'Scale',
    { type: 'number', default: 0, min: 0, max: 10, step: 0.05, hint: 'Largest random change of size on this axis.' },
    modifierStackRandomPerAxis,
  ),
  ...modifierStackRandomAxes('randomFlip', 'Flip', {
    type: 'boolean',
    default: false,
    hint: 'Mirrors a random half of the copies along this axis.',
  }),
  modifierStackRandomField({
    key: 'randomExcludeFirst',
    label: 'Exclude first',
    type: 'boolean',
    default: true,
    hint: 'Keeps the original, the first item, unrandomized.',
  }),
  modifierStackRandomField({
    key: 'randomExcludeLast',
    label: 'Exclude last',
    type: 'boolean',
    default: false,
    hint: 'Keeps the last copy unrandomized.',
  }),
  modifierStackRandomField({
    key: 'randomSeed',
    label: 'Seed',
    type: 'number',
    default: 0,
    min: 0,
    max: MODIFIER_STACK_RANDOM_MAX_SEED,
    integer: true,
    step: 1,
    hint: 'Another seed gives another random layout with the same settings.',
  }),
];

/**
 * Mixes a 32-bit integer (lowbias32), the same on every machine.
 *
 * @param value Integer.
 * @returns Mixed unsigned integer.
 */
function modifierStackRandomMix(value: number): number {
  let mixed = value >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

/**
 * Returns a deterministic value in [0, 1) for one seed, copy, piece and
 * channel.
 *
 * @param seed Integer seed.
 * @param index Copy index.
 * @param salt Piece index, zero for the whole input.
 * @param channel Random channel.
 * @returns Uniform value.
 */
export function modifierStackRandomValue(seed: number, index: number, salt: number, channel: number): number {
  let state = modifierStackRandomMix(seed);
  for (const part of [index, salt, channel]) state = modifierStackRandomMix(state ^ (part + 0x9e3779b9));
  return state / 4294967296;
}

/** Inputs of one copy's random transform. */
export interface ModifierStackRandomCopy {
  /** Copy index; zero is the original. */
  index: number;
  /** Copy count including the original. */
  count: number;
  /** Piece index, zero for the whole input. */
  salt: number;
  /** Point the copy turns, scales and flips about, in placement coordinates. */
  pivot: Vector3;
}

/**
 * Returns whether a copy is randomized.
 *
 * @param parameters Normalized parameters.
 * @param copy Copy being placed.
 * @returns True when randomize applies to it.
 */
export function modifierStackRandomApplies(
  parameters: Record<string, unknown>,
  copy: ModifierStackRandomCopy,
): boolean {
  if (!modifierStackRandomOn(parameters)) return false;
  if (copy.index === 0 && parameters['randomExcludeFirst'] !== false) return false;
  return !(copy.index === copy.count - 1 && parameters['randomExcludeLast'] === true);
}

/**
 * Returns the random transform of one copy, applied before the copy's own
 * placement like Blender's per-instance randomize: offset, then rotation, scale
 * and flip about the pivot.
 *
 * @param parameters Normalized parameters.
 * @param copy Copy being placed.
 * @returns Placement-space operator; identity when not randomized.
 */
export function modifierStackRandomTransform(
  parameters: Record<string, unknown>,
  copy: ModifierStackRandomCopy,
): Matrix4 {
  if (!modifierStackRandomApplies(parameters, copy)) return new Matrix4();
  const seed = Math.round(modifierStackNumber(parameters['randomSeed'], 0, 0, MODIFIER_STACK_RANDOM_MAX_SEED));
  const signed = (channel: number) => modifierStackRandomValue(seed, copy.index, copy.salt, channel) * 2 - 1;
  const axes = (base: number) => new Vector3(signed(base), signed(base + 1), signed(base + 2));
  const offset = modifierStackVector(parameters, 'randomOffset').multiply(axes(MODIFIER_STACK_RANDOM_CHANNEL.offset));
  const turn = modifierStackVector(parameters, 'randomRotation')
    .multiply(axes(MODIFIER_STACK_RANDOM_CHANNEL.rotation))
    .multiplyScalar(Math.PI / 180);
  const rotation = new Quaternion().setFromEuler(new Euler(turn.x, turn.y, turn.z));
  const scale = modifierStackRandomScale(parameters, axes(MODIFIER_STACK_RANDOM_CHANNEL.scale));
  scale.multiply(modifierStackRandomFlip(parameters, axes(MODIFIER_STACK_RANDOM_CHANNEL.flip)));
  const local = new Matrix4().compose(offset.add(copy.pivot), rotation, scale);
  return local.multiply(new Matrix4().makeTranslation(-copy.pivot.x, -copy.pivot.y, -copy.pivot.z));
}

/**
 * Returns the random scale factors.
 *
 * @param parameters Normalized parameters.
 * @param random Signed random values per axis.
 * @returns Positive factors.
 */
function modifierStackRandomScale(parameters: Record<string, unknown>, random: Vector3): Vector3 {
  const amount = modifierStackRandomPerAxis(parameters)
    ? modifierStackVector(parameters, 'randomScale')
    : new Vector3().setScalar(Number(parameters['randomScale'] ?? 0));
  const factors = modifierStackRandomPerAxis(parameters) ? random : new Vector3().setScalar(random.x);
  return amount.multiply(factors).addScalar(1).max(new Vector3().setScalar(MODIFIER_STACK_RANDOM_MIN_SCALE));
}

/**
 * Returns the random flip signs.
 *
 * @param parameters Normalized parameters.
 * @param random Signed random values per axis.
 * @returns −1 on flipped axes, else 1.
 */
function modifierStackRandomFlip(parameters: Record<string, unknown>, random: Vector3): Vector3 {
  const sign = (axis: 'X' | 'Y' | 'Z', value: number) =>
    parameters[`randomFlip${axis}`] === true && value < 0 ? -1 : 1;
  return new Vector3(sign('X', random.x), sign('Y', random.y), sign('Z', random.z));
}
