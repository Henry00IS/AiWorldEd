import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackChoices, modifierStackWhen } from '@/modifier/stack/modifier_stack_fields.js';
import { MODIFIER_STACK_RANDOM_MAX_SEED } from '@/modifier/stack/kinds/array/modifier_stack_array_random.js';
import {
  BLAST_HOLE_MAX_DETAIL,
  BLAST_HOLE_MAX_SPIKE_LENGTH,
  BLAST_HOLE_MAX_SPIKES,
  BLAST_HOLE_MIN_SPIKES,
} from './modifier_stack_blast_hole_outline.js';
import { BLAST_HOLE_MIN_BRICK } from './modifier_stack_blast_hole_bricks.js';
import {
  BLAST_HOLE_RAGGED_MAX_BITES,
  BLAST_HOLE_RAGGED_MAX_DETAIL,
  BLAST_HOLE_RAGGED_MAX_JAG,
  BLAST_HOLE_RAGGED_MIN_JAG,
} from './modifier_stack_blast_hole_ragged_depth.js';
import { BLAST_HOLE_FORMAT_VERSION_KEY, BLAST_HOLE_FORMAT_VERSION_LEGACY } from './modifier_stack_blast_hole_format.js';

/**
 * Returns whether Fill Back applies: only a subtracting Blast Hole can add its
 * shape back.
 *
 * @param parameters Normalized parameters.
 * @returns True in Subtract mode.
 */
export function blastHoleFillBackShown(parameters: Record<string, unknown>): boolean {
  return parameters['operation'] === 'subtract';
}

/** Shared shape of the Bricks style rows. */
const BLAST_HOLE_BRICK_ROW = { group: 'Bricks', visible: modifierStackWhen('style', 'bricks') };

/** Rows only the Jagged style uses. */
const BLAST_HOLE_JAGGED_ROW = { visible: modifierStackWhen('style', 'jagged') };

/** Rows of the star-shaped outline the Bricks style knocks bricks out of. */
const BLAST_HOLE_BRICK_OUTLINE_ROW = { visible: modifierStackWhen('style', 'bricks') };

/** Blast Hole rows, most used first. */
export const BLAST_HOLE_FIELDS: readonly ModifierStackField[] = [
  {
    key: 'style',
    label: 'Style',
    type: 'choice',
    default: 'jagged',
    choices: [
      { value: 'jagged', label: 'Jagged', title: 'A ragged hole that fills the box, leaving a broken rim of wall.' },
      { value: 'bricks', label: 'Bricks', title: 'Knocks out whole bricks inside a star-shaped blast outline.' },
    ],
    hint: 'Jagged cuts a ragged hole that fills the box; Bricks knocks out whole bricks.',
  },
  {
    key: 'seed',
    label: 'Seed',
    type: 'number',
    default: 1,
    min: 0,
    max: MODIFIER_STACK_RANDOM_MAX_SEED,
    integer: true,
    step: 1,
    hint: 'Picks a different hole shape. The same seed always gives the same hole.',
  },
  {
    key: 'fillBack',
    label: 'Fill Back',
    type: 'boolean',
    default: false,
    visible: blastHoleFillBackShown,
    hint: 'Cuts the hole, then fills it with the same shape, ready for a Physics Shatter step to blow out.',
  },
  {
    ...BLAST_HOLE_JAGGED_ROW,
    key: 'shape',
    label: 'Shape',
    type: 'number',
    default: 0.8,
    min: 0,
    max: 1,
    step: 0.05,
    hint: 'Hole outline before the jags: 0 is a circle (a stadium on long walls), 1 a rectangle.',
  },
  {
    ...BLAST_HOLE_JAGGED_ROW,
    key: 'jagSize',
    label: 'Jag Size',
    type: 'number',
    default: 0.3,
    min: BLAST_HOLE_RAGGED_MIN_JAG,
    max: BLAST_HOLE_RAGGED_MAX_JAG,
    step: 0.05,
    hint: 'Size of the broken chunks along the edge, in metres. Wider walls get more jags, not wider ones.',
  },
  {
    ...BLAST_HOLE_BRICK_OUTLINE_ROW,
    key: 'spikes',
    label: 'Spikes',
    type: 'number',
    default: 9,
    min: BLAST_HOLE_MIN_SPIKES,
    max: BLAST_HOLE_MAX_SPIKES,
    integer: true,
    step: 1,
    hint: 'Number of spikes around the hole.',
  },
  {
    ...BLAST_HOLE_BRICK_OUTLINE_ROW,
    key: 'spikeLength',
    label: 'Spike Length',
    type: 'number',
    default: 0.45,
    min: 0,
    max: BLAST_HOLE_MAX_SPIKE_LENGTH,
    step: 0.05,
    hint: 'How far the notches between spikes cut in, as a share of the hole size.',
  },
  {
    key: 'roughness',
    label: 'Roughness',
    type: 'number',
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
    hint: 'How deep the jags cut in; for Bricks, how uneven the outline spikes are.',
  },
  {
    ...BLAST_HOLE_JAGGED_ROW,
    key: 'bites',
    label: 'Bites',
    type: 'number',
    default: 3,
    min: 0,
    max: BLAST_HOLE_RAGGED_MAX_BITES,
    integer: true,
    step: 1,
    hint: 'Deep notches where big chunks of wall stay standing in the hole.',
  },
  {
    key: 'detail',
    label: 'Edge Detail',
    type: 'number',
    default: 1,
    min: 0,
    max: Math.max(BLAST_HOLE_MAX_DETAIL, BLAST_HOLE_RAGGED_MAX_DETAIL),
    integer: true,
    step: 1,
    hint: 'Finer teeth and chips on the edge; for Bricks, extra points along each outline spike.',
  },
  {
    ...BLAST_HOLE_BRICK_ROW,
    key: 'brickLength',
    label: 'Brick Length',
    type: 'number',
    default: 0.4,
    min: BLAST_HOLE_MIN_BRICK,
    max: 10,
    step: 0.05,
    hint: 'Brick size along the wall, in metres. Match Physics Shatter to line up.',
  },
  {
    ...BLAST_HOLE_BRICK_ROW,
    key: 'brickHeight',
    label: 'Brick Height',
    type: 'number',
    default: 0.2,
    min: BLAST_HOLE_MIN_BRICK,
    max: 10,
    step: 0.05,
    hint: 'Brick size upwards, in metres. Rows start at the bottom of the box.',
  },
  {
    ...BLAST_HOLE_BRICK_ROW,
    key: 'bond',
    label: 'Bond',
    type: 'choice',
    default: 'running',
    choices: modifierStackChoices([
      ['running', 'Running (half brick)'],
      ['third', 'Third Bond'],
      ['stack', 'Stack Bond'],
    ]),
    hint: 'How far each row shifts. Running matches Physics Shatter bricks.',
  },
  {
    ...BLAST_HOLE_BRICK_ROW,
    key: 'jut',
    label: 'Jut Chance',
    type: 'number',
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
    hint: 'Chance that an edge brick only loses its front, so its back juts into the hole.',
  },
  {
    key: BLAST_HOLE_FORMAT_VERSION_KEY,
    label: 'Format Version',
    type: 'number',
    default: BLAST_HOLE_FORMAT_VERSION_LEGACY,
    min: 1,
    integer: true,
    hidden: true,
    hint: 'Saved data format of this Blast Hole.',
  },
];
