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

/** Blast Hole rows, most used first. */
export const BLAST_HOLE_FIELDS: readonly ModifierStackField[] = [
  {
    key: 'style',
    label: 'Style',
    type: 'choice',
    default: 'jagged',
    choices: modifierStackChoices([
      ['jagged', 'Jagged'],
      ['bricks', 'Bricks'],
    ]),
    hint: 'Jagged cuts a star-shaped blast outline; Bricks knocks out whole bricks along it.',
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
    hint: 'How uneven the spikes are. 0 makes a regular star.',
  },
  {
    key: 'detail',
    label: 'Edge Detail',
    type: 'number',
    default: 1,
    min: 0,
    max: BLAST_HOLE_MAX_DETAIL,
    integer: true,
    step: 1,
    hint: 'Extra jagged points along each spike edge.',
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
];
