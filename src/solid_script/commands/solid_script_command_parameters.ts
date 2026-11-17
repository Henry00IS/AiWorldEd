import {
  SOLID_SCRIPT_ANCHOR_CAPTIONS,
  SOLID_SCRIPT_ANCHOR_WORDS,
  solidScriptAnchorDefault,
  type SolidScriptAnchorAxis,
} from '@/solid_script/language/solid_script_anchor.js';
import type {
  SolidScriptCommandParameter,
  SolidScriptCommandParameterType,
  SolidScriptCommandWord,
} from './solid_script_command.js';
import { SOLID_SCRIPT_SHAPE_NAME_KEY } from '@/solid_script/language/solid_script_shape.js';
import { SOLID_SCRIPT_RINGS, SOLID_SCRIPT_SIDES } from '@/solid_script/language/solid_script_primitives.js';

/**
 * Describes one field of a command.
 *
 * @param key Key of the stored value.
 * @param label Visible caption.
 * @param type Editor the configurator shows.
 * @param fallback Value of a new line.
 * @param hint Hover text.
 * @returns Field.
 */
export function solidScriptParameter(
  key: string,
  label: string,
  type: SolidScriptCommandParameterType,
  fallback: string,
  hint: string,
): SolidScriptCommandParameter {
  return { key, label, type, default: fallback, hint };
}

/**
 * Describes a field that takes one of a few words.
 *
 * @param key Key of the stored value.
 * @param label Visible caption.
 * @param type Editor the configurator shows: text as typed, or message for
 *   words a variable may hold.
 * @param fallback Value of a new command line.
 * @param hint Hover text.
 * @param words The words, each with its meaning.
 * @returns Field.
 */
export function solidScriptParameterWords(
  key: string,
  label: string,
  type: 'text' | 'message',
  fallback: string,
  hint: string,
  words: readonly SolidScriptCommandWord[],
): SolidScriptCommandParameter {
  return { key, label, type, default: fallback, hint, words };
}

/**
 * Describes a field that may stay empty.
 *
 * @param key Key of the stored value.
 * @param label Visible caption.
 * @param type Editor the configurator shows.
 * @param hint Hover text.
 * @returns Field.
 */
export function solidScriptParameterOptional(
  key: string,
  label: string,
  type: SolidScriptCommandParameterType,
  hint: string,
): SolidScriptCommandParameter {
  return { key, label, type, default: '', hint, optional: true };
}

/**
 * The Anchor of a shape: the spot of its box that sits on the origin, one word
 * per axis, such as Center, Bottom, Back for a shape standing on the origin
 * with its back on it.
 *
 * @param axes Axes it sets.
 * @returns Parameter.
 */
export function solidScriptParameterAnchor(axes: readonly SolidScriptAnchorAxis[]): SolidScriptCommandParameter {
  const words = axes.map(
    (axis) => `${SOLID_SCRIPT_ANCHOR_CAPTIONS[axis]} ${SOLID_SCRIPT_ANCHOR_WORDS[axis].join('/')}`,
  );
  return {
    ...solidScriptParameter(
      'anchor',
      'Anchor',
      'message',
      solidScriptAnchorDefault(axes),
      `The spot of the brush that sits on the origin, the centre of the generator: ${words.join(', ')}.`,
    ),
    anchor: axes,
    words: axes
      .reduce<string[][]>(
        (combos, axis) => combos.flatMap((combo) => SOLID_SCRIPT_ANCHOR_WORDS[axis].map((word) => [...combo, word])),
        [[]],
      )
      .map((combo) => ({ word: combo.join(', '), detail: 'Anchor' })),
  };
}

/**
 * The Sides field of round shapes, named and limited like the primitive
 * generators.
 *
 * @returns Field.
 */
export function solidScriptParameterSides(): SolidScriptCommandParameter {
  return solidScriptParameter(
    'sides',
    'Sides',
    'count',
    String(SOLID_SCRIPT_SIDES.default),
    `Faces around the axis, ${SOLID_SCRIPT_SIDES.min} to ${SOLID_SCRIPT_SIDES.max}. More sides look rounder and cost more polygons.`,
  );
}

/**
 * The Rings field of a sphere, named and limited like the sphere generator.
 *
 * @returns Field.
 */
export function solidScriptParameterRings(): SolidScriptCommandParameter {
  return solidScriptParameter(
    'rings',
    'Rings',
    'count',
    String(SOLID_SCRIPT_RINGS.default),
    `Bands from the bottom to the top, ${SOLID_SCRIPT_RINGS.min} to ${SOLID_SCRIPT_RINGS.max}. More rings look rounder and cost more polygons.`,
  );
}

/**
 * The optional Name of a shape line.
 *
 * @returns Field.
 */
export function solidScriptParameterShapeName(): SolidScriptCommandParameter {
  return solidScriptParameterOptional(
    SOLID_SCRIPT_SHAPE_NAME_KEY,
    'Name',
    'text',
    'Optional name, such as Knob, so Select Faces, For Each Vertex and For Each Edge can pick this brush by it. Brushes may share a name; case does not matter.',
  );
}

/**
 * The optional Of field of lines that work on the shapes above: only shapes
 * with that Name, offered from the names the script uses.
 *
 * @param what What the line picks, such as faces.
 * @returns Field.
 */
export function solidScriptParameterOf(what: string): SolidScriptCommandParameter {
  return {
    ...solidScriptParameterOptional(
      'of',
      'Of',
      'value',
      `Only ${what} of the brushes with this Name, in any case, a brush of [Input.Brushes] such as Input 1, or a list of them; empty uses every brush above, or else the brushes a modifier receives.`,
    ),
    nameGroups: ['Brushes', 'Parts'],
  };
}
