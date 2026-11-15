import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import {
  modifierStackChoices,
  modifierStackVectorFields,
  modifierStackWhen,
} from '@/modifier/stack/modifier_stack_fields.js';
import { MODIFIER_STACK_RANDOM_MAX_SEED } from '@/modifier/stack/kinds/array/modifier_stack_array_random.js';

/** Largest Max Pieces value the inspector accepts. */
export const PHYSICS_SHATTER_MAX_PIECES_LIMIT = 2000;

/** Shared shape of the bricks mode fields. */
const PHYSICS_SHATTER_BRICK_FIELD = { type: 'number' as const, visible: modifierStackWhen('mode', 'bricks') };

/** Bricks mode fields: brick size, mortar gap and joint jitter. */
const PHYSICS_SHATTER_BRICK_FIELDS: readonly ModifierStackField[] = [
  {
    ...PHYSICS_SHATTER_BRICK_FIELD,
    key: 'brickLength',
    label: 'Brick Length',
    default: 0.4,
    min: 0.02,
    max: 50,
    step: 0.05,
    hint: 'Brick size along the wall, in metres.',
  },
  {
    ...PHYSICS_SHATTER_BRICK_FIELD,
    key: 'brickHeight',
    label: 'Brick Height',
    default: 0.2,
    min: 0.02,
    max: 50,
    step: 0.05,
    hint: 'Brick size upwards, in metres.',
  },
  {
    ...PHYSICS_SHATTER_BRICK_FIELD,
    key: 'mortarGap',
    label: 'Mortar Gap',
    default: 0,
    min: 0,
    max: 1,
    step: 0.005,
    hint: 'Space left between neighbouring bricks, in metres.',
  },
  {
    ...PHYSICS_SHATTER_BRICK_FIELD,
    key: 'brickJitter',
    label: 'Joint Jitter',
    default: 0,
    min: 0,
    max: 1,
    step: 0.05,
    hint: 'Shifts the joints between bricks randomly, up to a quarter brick at 1.',
  },
];

/** Pattern and piece size fields. */
const PHYSICS_SHATTER_PATTERN_FIELDS: readonly ModifierStackField[] = [
  {
    key: 'mode',
    label: 'Pattern',
    type: 'choice',
    default: 'glass',
    choices: modifierStackChoices([
      ['glass', 'Glass Cracks'],
      ['bricks', 'Bricks'],
    ]),
    hint: 'Glass Cracks breaks the input into random shards; Bricks lays a staggered brick bond.',
  },
  {
    key: 'crackSize',
    label: 'Crack Size',
    type: 'number',
    default: 0.5,
    min: 0.05,
    max: 50,
    step: 0.05,
    visible: modifierStackWhen('mode', 'glass'),
    hint: 'Typical shard size in metres. Smaller values make more, smaller shards.',
  },
  {
    key: 'impactDetail',
    label: 'Impact Detail',
    type: 'number',
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
    visible: modifierStackWhen('mode', 'glass'),
    hint: 'Gathers smaller shards around the impact point. 0 spreads them evenly.',
  },
  ...PHYSICS_SHATTER_BRICK_FIELDS,
  {
    key: 'seed',
    label: 'Seed',
    type: 'number',
    default: 1,
    min: 0,
    max: MODIFIER_STACK_RANDOM_MAX_SEED,
    integer: true,
    step: 1,
    hint: 'Picks a different random crack pattern. The same seed always gives the same pieces.',
  },
  {
    key: 'maxPieces',
    label: 'Max Pieces',
    type: 'number',
    default: 300,
    min: 1,
    max: PHYSICS_SHATTER_MAX_PIECES_LIMIT,
    integer: true,
    step: 10,
    hint: 'Most pieces made from all captured brushes together.',
  },
];

/** Shared shapes of the crack face UV fields. */
const PHYSICS_SHATTER_INSIDE_SCALE = {
  type: 'number' as const,
  default: 1,
  min: 0.01,
  max: 1000,
  step: 0.25,
  group: 'Crack Faces',
  hint: 'Metres covered by one texture tile.',
};

/** Shared shape of the crack face UV offset fields. */
const PHYSICS_SHATTER_INSIDE_OFFSET = {
  type: 'number' as const,
  default: 0,
  step: 0.25,
  group: 'Crack Faces',
  hint: 'Slides the texture, in metres.',
};

/** Crack face UV scale, offset and rotation fields. */
const PHYSICS_SHATTER_INSIDE_UV_FIELDS: readonly ModifierStackField[] = [
  { ...PHYSICS_SHATTER_INSIDE_SCALE, key: 'insideScaleU', label: 'U Scale' },
  { ...PHYSICS_SHATTER_INSIDE_SCALE, key: 'insideScaleV', label: 'V Scale' },
  { ...PHYSICS_SHATTER_INSIDE_OFFSET, key: 'insideOffsetU', label: 'U Offset' },
  { ...PHYSICS_SHATTER_INSIDE_OFFSET, key: 'insideOffsetV', label: 'V Offset' },
  {
    key: 'insideRotation',
    label: 'Rotation',
    type: 'number',
    default: 0,
    min: -360,
    max: 360,
    step: 15,
    group: 'Crack Faces',
    hint: 'Turns the texture on the crack faces, in degrees.',
  },
];

/** Texture fields of the crack faces. */
const PHYSICS_SHATTER_INSIDE_FIELDS: readonly ModifierStackField[] = [
  {
    key: 'insideTexture',
    label: 'Inside Texture',
    type: 'texture',
    default: '',
    group: 'Crack Faces',
    hint: 'Texture of the faces the cracks open up. Default uses the texture of the broken brush.',
  },
  {
    key: 'insideProjection',
    label: 'Projection',
    type: 'choice',
    default: 'world',
    choices: modifierStackChoices([
      ['world', 'World Aligned'],
      ['box', 'Box'],
    ]),
    group: 'Crack Faces',
    hint: 'World Aligned lays the texture flat on each crack face; Box projects it from the nearest side, like a box map.',
  },
  ...PHYSICS_SHATTER_INSIDE_UV_FIELDS,
];

/** Blast fields: where it hits, which way it pushes, and how hard. */
const PHYSICS_SHATTER_BLAST_FIELDS: readonly ModifierStackField[] = [
  ...modifierStackVectorFields('impact', 'Impact', [0, 0, 0], {
    group: 'Blast',
    hint: 'Impact point relative to the volume centre, in metres along the volume axes. The arrow tip marks it.',
  }),
  ...modifierStackVectorFields('direction', 'Direction', [0, 0, -1], {
    group: 'Blast',
    step: 0.1,
    hint: 'Direction the blast pushes, along the volume axes. The arrow shows it.',
  }),
  {
    key: 'strength',
    label: 'Strength',
    type: 'number',
    default: 10,
    min: 0,
    max: 1000,
    step: 1,
    group: 'Blast',
    hint: 'How hard the blast throws the pieces.',
  },
  {
    key: 'radius',
    label: 'Radius',
    type: 'number',
    default: 1.5,
    min: 0.05,
    max: 100,
    step: 0.1,
    group: 'Blast',
    hint: 'Reach of the blast in metres. In bricks mode, bricks farther away stay stuck in the wall.',
  },
  {
    key: 'duration',
    label: 'Duration',
    type: 'number',
    default: 3,
    min: 0.5,
    max: 10,
    step: 0.5,
    group: 'Blast',
    hint: 'Most seconds the physics simulation runs, at 60 steps a second. It stops early once every piece rests.',
  },
];

/** Every inspector field of the Physics Shatter modifier, in inspector order. */
export const PHYSICS_SHATTER_FIELDS: readonly ModifierStackField[] = [
  ...PHYSICS_SHATTER_PATTERN_FIELDS,
  ...PHYSICS_SHATTER_INSIDE_FIELDS,
  ...PHYSICS_SHATTER_BLAST_FIELDS,
];
