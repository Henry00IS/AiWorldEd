import type { GeneratorRevolveStation } from '@/generator/revolve/generator_revolve_profile.js';
import { generatorRevolveWidestPerimeter } from '@/generator/revolve/generator_revolve_perimeter.js';
import type { GeneratorRevolveWrap } from '@/generator/revolve/generator_revolve_surface.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackChoices, modifierStackWhen } from '@/modifier/stack/modifier_stack_fields.js';

/** Wrap mode of a revolved shape's texture. */
const MODIFIER_STACK_REVOLVE_WRAP_FIELD: ModifierStackField = {
  key: 'wrap',
  label: 'Wrap',
  type: 'choice',
  default: 'stretch',
  group: 'Texture',
  choices: modifierStackChoices([
    ['metre', 'Tile Per Metre'],
    ['stretch', 'Stretch'],
    ['tile', 'Tile'],
  ]),
  hint: 'Tile Per Metre repeats the texture about once per metre in whole repeats, so the seam closes; Stretch wraps it once around and once bottom to top; Tile repeats it a set number of times.',
};

/** Repeat settings shown while the texture tiles. */
const MODIFIER_STACK_REVOLVE_TILE_FIELDS: readonly ModifierStackField[] = [
  {
    key: 'repeatAround',
    label: 'Repeat Around',
    hint: 'How many times the texture repeats around the shape.',
    type: 'number',
    default: 1,
    min: 1,
    max: 64,
    integer: true,
    step: 1,
    group: 'Texture',
    visible: modifierStackWhen('wrap', 'tile'),
  },
  {
    key: 'tileAlong',
    label: 'Along',
    type: 'choice',
    default: 'density',
    group: 'Texture',
    choices: modifierStackChoices([
      ['density', 'Match Texel Density'],
      ['count', 'Repeat Count'],
    ]),
    hint: 'Match Texel Density keeps tiles square at the widest ring; Repeat Count sets how often the texture repeats from bottom to top.',
    visible: modifierStackWhen('wrap', 'tile'),
  },
  {
    key: 'repeatAlong',
    label: 'Repeat Along',
    hint: 'How many times the texture repeats from the bottom to the top of the shape.',
    type: 'number',
    default: 1,
    min: 1,
    max: 256,
    integer: true,
    step: 1,
    group: 'Texture',
    visible: (parameters) => parameters['wrap'] === 'tile' && parameters['tileAlong'] === 'count',
  },
];

/**
 * Builds the texture wrap fields of a revolved shape: stretch once, tile whole
 * repeats, or tile about once per metre.
 *
 * @param defaultMode Wrap mode of new shapes.
 * @returns Wrap fields.
 */
export function modifierStackRevolveWrapFields(defaultMode: 'stretch' | 'tile' | 'metre'): ModifierStackField[] {
  return [{ ...MODIFIER_STACK_REVOLVE_WRAP_FIELD, default: defaultMode }, ...MODIFIER_STACK_REVOLVE_TILE_FIELDS];
}

/**
 * Reads the texture wrap of a revolved shape. Tile Per Metre picks the whole
 * repeat count closest to one per metre around the widest ring and keeps the
 * tiles square along the profile.
 *
 * @param parameters Normalized parameters.
 * @param stations Profile stations in metres.
 * @param sides Side count of the round rings.
 * @param aspect Depth relative to width.
 * @returns Wrap options.
 */
export function modifierStackRevolveWrap(
  parameters: Record<string, unknown>,
  stations: readonly GeneratorRevolveStation[],
  sides: number,
  aspect: number,
): GeneratorRevolveWrap {
  if (parameters['wrap'] === 'metre') {
    const around = Math.max(1, Math.round(generatorRevolveWidestPerimeter(stations, sides, aspect)));
    return { mode: 'tile', around, along: 'density' };
  }
  const along = parameters['tileAlong'] === 'count' ? Number(parameters['repeatAlong']) : 'density';
  return {
    mode: parameters['wrap'] === 'tile' ? 'tile' : 'stretch',
    around: Number(parameters['repeatAround']),
    along,
  };
}
