import {
  SOLID_SCRIPT_ANCHOR_CAPTIONS,
  SOLID_SCRIPT_ANCHOR_WORDS,
  solidScriptAnchorDefault,
  type SolidScriptAnchorAxis,
} from '@/solid_script/language/solid_script_anchor.js';
import type {
  SolidScriptCommandAccepts,
  SolidScriptCommandGives,
  SolidScriptCommandParameter,
  SolidScriptCommandParameterType,
  SolidScriptCommandParameterWrites,
  SolidScriptCommandWord,
} from './solid_script_command.js';
import { SOLID_SCRIPT_SHAPE_NAME_KEY } from '@/solid_script/language/solid_script_shape.js';
import { SOLID_SCRIPT_RINGS, SOLID_SCRIPT_SIDES } from '@/solid_script/language/solid_script_primitives.js';

/**
 * Kinds of value each kind of field accepts unless the field says otherwise:
 * number fields take numbers or text that reads as one, vector and point fields
 * numbers, vectors and lists, and the rest any value.
 */
export const SOLID_SCRIPT_FIELD_ACCEPTS: Readonly<Record<SolidScriptCommandParameterType, SolidScriptCommandAccepts>> =
  {
    number: ['Number', 'Text'],
    count: ['Number', 'Text'],
    vector2: ['Vector', 'Number', 'Text', 'List', 'Number List'],
    vector3: ['Vector', 'Number', 'Text', 'List', 'Number List'],
    points2: ['Vector', 'Number', 'Text', 'List', 'Number List', 'Vector List'],
    points3: ['Vector', 'Number', 'Text', 'List', 'Number List', 'Vector List'],
    boolean: ['Yes/No', 'Number', 'Text'],
    value: 'Any',
    condition: 'Any',
    message: 'Any',
    name: 'Any',
    target: 'Any',
    text: 'Any',
  };

/**
 * Kinds the Of field of lines that work on geometry accepts: elements, lists of
 * them, and text naming brushes.
 */
export const SOLID_SCRIPT_OF_ACCEPTS: SolidScriptCommandAccepts = [
  'Brush',
  'Face',
  'Edge',
  'Vertex',
  'Text',
  'List',
  'Brush List',
  'Face List',
  'Edge List',
  'Vertex List',
  'Text List',
];

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
  return { key, label, type, default: fallback, hint, accepts: SOLID_SCRIPT_FIELD_ACCEPTS[type] };
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
  return { key, label, type, default: fallback, hint, words, accepts: SOLID_SCRIPT_FIELD_ACCEPTS[type] };
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
  return { key, label, type, default: '', hint, optional: true, accepts: SOLID_SCRIPT_FIELD_ACCEPTS[type] };
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
    'Optional name, such as Knob, so Of fields can pick this brush by it. Brushes may share a name; case does not matter.',
  );
}

/**
 * The Of field of lines that work on geometry: a value such as [Face] or [Top],
 * a list of them, or a Name tag; empty uses a [$Selected.*] list, shown greyed
 * in the empty field.
 *
 * @param what What the line takes, such as faces or brushes.
 * @param fallback The system list an empty Of uses, such as $Selected.Faces.
 * @returns Field.
 */
export function solidScriptParameterOf(what: string, fallback: string): SolidScriptCommandParameter {
  return {
    ...solidScriptParameterOptional(
      'of',
      'Of',
      'value',
      `The ${what} to work on: a variable such as [Face], a list, or a Name given to brushes; empty uses [${fallback}].`,
    ),
    placeholder: `[${fallback}]`,
    nameGroups: ['Brushes', 'Parts'],
    accepts: SOLID_SCRIPT_OF_ACCEPTS,
  };
}

/**
 * The optional Into field of lines that make something: the variable it is
 * written to.
 *
 * @param what What is written, such as the new brushes, a Brush list.
 * @param kind Kind written, such as Brush List.
 * @param detail Short description of the variable in the names list, such as
 *   top faces, followed by of and the block.
 * @returns Field.
 */
export function solidScriptParameterInto(what: string, kind: string, detail: string): SolidScriptCommandParameter {
  return solidScriptParameterWrites(
    solidScriptParameterOptional('into', 'Into', 'name', `Variable to write ${what} to; empty writes none.`),
    { rule: 'kind', kind, what: `${detail} of **{command}**` },
  );
}

/**
 * Marks a field as naming a variable the line writes or changes, so it offers
 * the script's variables as they are typed and the checks know what it holds
 * after the line.
 *
 * @param parameter Field.
 * @param gives What the variable holds after the line.
 * @param offers Plain names, whole paths a Set can write, or none.
 * @returns Field that writes it.
 */
export function solidScriptParameterWrites(
  parameter: SolidScriptCommandParameter,
  gives: SolidScriptCommandGives,
  offers: SolidScriptCommandParameterWrites = 'name',
): SolidScriptCommandParameter {
  return { ...parameter, writes: { offers, gives } };
}
