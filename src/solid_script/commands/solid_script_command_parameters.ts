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
  SolidScriptInto,
} from './solid_script_command.js';
import { SOLID_SCRIPT_SHAPE_NAME_KEY } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptParameterValueEffective } from './solid_script_parameter_default.js';
import { SOLID_SCRIPT_RINGS, SOLID_SCRIPT_SIDES } from '@/solid_script/language/solid_script_primitives.js';
import {
  SOLID_SCRIPT_GROUP_MODE_DEFAULT,
  SOLID_SCRIPT_GROUP_MODE_WORDS,
  SOLID_SCRIPT_MODE_DEFAULT,
  SOLID_SCRIPT_MODE_WORDS,
} from '@/solid_script/language/solid_script_mode.js';

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
    points3: ['Vector', 'Number', 'Text', 'List', 'Number List', 'Vector List', 'Path'],
    boolean: ['Yes/No', 'Number', 'Text'],
    value: 'Any',
    condition: 'Any',
    message: 'Any',
    name: 'Any',
    target: 'Any',
    text: 'Any',
  };

/**
 * Kinds a field that takes one of a few words accepts: the word, or a number
 * for numbered words.
 */
export const SOLID_SCRIPT_WORDS_ACCEPTS: SolidScriptCommandAccepts = ['Text', 'Number'];

/**
 * Kinds an Of field accepts: the elements its line works on, lists of them, and
 * text naming brushes.
 *
 * @param elements Element kinds the line works on, such as Face and Brush.
 * @returns Kinds.
 */
export function solidScriptOfAccepts(elements: readonly string[]): SolidScriptCommandAccepts {
  return [...elements, 'Text', 'List', ...elements.map((kind) => `${kind} List`), 'Text List'];
}

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
  return { key, label, type, default: fallback, hint, words, accepts: SOLID_SCRIPT_WORDS_ACCEPTS };
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
 * Autocomplete hint of an Anchor word: a star marks the two most common.
 *
 * @param word Anchor text, such as "Center, Bottom, Center".
 * @returns Hint.
 */
function solidScriptAnchorWordDetail(word: string): string {
  return word === 'Center, Center, Center' || word === 'Center, Bottom, Center' ? 'Anchor. ⭐' : 'Anchor.';
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
      'value',
      solidScriptAnchorDefault(axes),
      `The spot of the solid that sits on the origin, the center of the generator: ${words.join(', ')}. Type one word per axis, such as Center, Bottom, Center to stand on the origin.`,
    ),
    anchor: axes,
    accepts: ['Text', 'Text List'],
    words: axes
      .reduce<string[][]>(
        (combos, axis) => combos.flatMap((combo) => SOLID_SCRIPT_ANCHOR_WORDS[axis].map((word) => [...combo, word])),
        [[]],
      )
      .map((combo) => {
        const word = combo.join(', ');
        return { word, detail: solidScriptAnchorWordDetail(word) };
      }),
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
    `Faces around the axis, ${SOLID_SCRIPT_SIDES.min} to ${SOLID_SCRIPT_SIDES.max}, such as 16. More sides look rounder and cost more polygons.`,
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
    `Bands from the bottom to the top, ${SOLID_SCRIPT_RINGS.min} to ${SOLID_SCRIPT_RINGS.max}, such as 8. More rings look rounder and cost more polygons.`,
  );
}

/**
 * The optional Name of a shape line.
 *
 * @returns Field.
 */
export function solidScriptParameterShapeName(): SolidScriptCommandParameter {
  return {
    ...solidScriptParameterOptional(
      SOLID_SCRIPT_SHAPE_NAME_KEY,
      'Name',
      'text',
      'Optional name, such as Knob or Post [I], so Of fields can pick this solid by it. Solids may share a name; case does not matter.',
    ),
    accepts: ['Text', 'Number'],
  };
}

/**
 * The Of field of lines that work on geometry: a value such as [Top] or
 * [Picked], a list of them, or a Name tag; empty uses a [$Selected.*] list,
 * shown greyed in the empty field.
 *
 * @param what What the line takes, such as faces or brushes.
 * @param fallback The system list an empty Of uses, such as $Selected.Faces.
 * @param elements Element kinds the line works on, the ones its runtime takes.
 * @returns Field.
 */
export function solidScriptParameterOf(
  what: string,
  fallback: string,
  elements: readonly string[] = ['Object', 'Face'],
): SolidScriptCommandParameter {
  return {
    ...solidScriptParameterOptional(
      'of',
      'Of',
      'value',
      `The ${what} to work on: a variable such as [Top], a list, or a Name given to objects; empty uses [${fallback}].`,
    ),
    placeholder: `[${fallback}]`,
    nameGroups: ['Objects', 'Parts'],
    accepts: solidScriptOfAccepts(elements),
  };
}

/**
 * The optional Into field of lines that make something: the variable it is
 * written to. Copy holds a brush or mesh result and withholds it; label only
 * names new faces, edges, points or other values.
 *
 * @param what What is written, such as the new brushes, a Brush list.
 * @param kind Kind written, such as Brush List.
 * @param detail Short description of the variable in the names list, such as
 *   top faces, followed by of and the block.
 * @param into Whether the field holds a brush or mesh copy, or only a label.
 * @returns Field.
 */
export function solidScriptParameterInto(
  what: string,
  kind: string,
  detail: string,
  into: SolidScriptInto,
): SolidScriptCommandParameter {
  return {
    ...solidScriptParameterWrites(
      solidScriptParameterOptional(
        'into',
        'Into',
        'name',
        `Variable to write ${what} to, such as Held; left off writes none.`,
      ),
      { rule: 'kind', kind, what: `${detail} of **{command}**` },
    ),
    into,
  };
}

/**
 * The optional Into field of an edit tool: empty edits in place; a name keeps
 * the original and holds only the edited copy.
 *
 * @returns Field.
 */
export function solidScriptParameterToolInto(): SolidScriptCommandParameter {
  return {
    ...solidScriptParameterWrites(
      solidScriptParameterOptional(
        'into',
        'Into',
        'name',
        'Variable for the edited copy, such as Edited; left off edits in place. When set, the original stays and the result is only in this variable.',
      ),
      { rule: 'kind', kind: 'Object List', what: 'edited copy of **{command}**' },
    ),
    into: 'copy',
  };
}

/**
 * Marks a field as defining a name or a setting the editor reads before the
 * script runs: a Function and its inputs, a part, the settings of an Input, or
 * the input a handler or Set Input works on. Like a field naming a variable it
 * is used as typed, and it gives no variable a value.
 *
 * @param parameter Field.
 * @param groups Name groups it offers, if any.
 * @returns The field, marked.
 */
export function solidScriptParameterDefines(
  parameter: SolidScriptCommandParameter,
  groups?: readonly string[],
): SolidScriptCommandParameter {
  const marked = solidScriptParameterWrites(parameter, { rule: 'defines' }, 'none');
  return groups ? { ...marked, nameGroups: groups } : marked;
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

/**
 * Marks a field as shown only while another field holds one of a few words.
 *
 * @param parameter Field.
 * @param field Key of the field that chooses.
 * @param words Words that show this field.
 * @returns Field, marked.
 */
export function solidScriptParameterWhen(
  parameter: SolidScriptCommandParameter,
  field: string,
  words: readonly string[],
): SolidScriptCommandParameter {
  return { ...parameter, when: { field, words } };
}

/**
 * Tells whether a field applies to the values as typed: fields with no When
 * always do, and a When whose choice is not one of that field's known words
 * (such as a variable) also shows, because the choice is only known when the
 * script runs. A field whose choosing field is hidden is hidden too.
 *
 * @param parameter Field.
 * @param values Stored or default values by key.
 * @param parameters Every field of the command, so the choice can use its
 *   default and its words.
 * @returns True when the field is used.
 */
export function solidScriptParameterApplies(
  parameter: SolidScriptCommandParameter,
  values: Readonly<Record<string, string>>,
  parameters: readonly SolidScriptCommandParameter[],
): boolean {
  const rule = parameter.when;
  if (!rule) return true;
  const source = parameters.find((entry) => entry.key === rule.field);
  const text = solidScriptParameterValueEffective(values[rule.field], source?.default ?? '').trim();
  const folded = text.toLowerCase();
  const known = source?.words?.map((entry) => entry.word.toLowerCase()) ?? [];
  const holds = rule.words.some((word) => word.toLowerCase() === folded) || (text !== '' && !known.includes(folded));
  return holds && (!source || solidScriptParameterApplies(source, values, parameters));
}

/**
 * Mode of a brush generator: Additive, Subtractive or Intersecting, the
 * editor's exact labels. The default is Additive, and Pass-Through is only for
 * groups.
 *
 * @returns Field.
 */
export function solidScriptParameterMode(): SolidScriptCommandParameter {
  return {
    ...solidScriptParameterWords(
      'mode',
      'Mode',
      'message',
      SOLID_SCRIPT_MODE_DEFAULT,
      'How this solid combines with the ones before it in the scene: Additive adds it, Subtractive cuts it out of them, Intersecting keeps only the overlap. Type one word, such as Subtractive to cut a doorway.',
      SOLID_SCRIPT_MODE_WORDS,
    ),
    optional: true,
  };
}

/**
 * Mode of a Part or Group: Additive, Subtractive, Intersecting or Pass-Through.
 * Empty means Additive. Unlike a brush Mode, it does not inherit the insertion
 * operation.
 *
 * @returns Field.
 */
export function solidScriptParameterGroupMode(): SolidScriptCommandParameter {
  return {
    ...solidScriptParameterWords(
      'mode',
      'Mode',
      'message',
      SOLID_SCRIPT_GROUP_MODE_DEFAULT,
      'How this group combines with the ones before it: Additive adds it, Subtractive cuts it out of them, Intersecting keeps only the overlap, Pass-Through acts like a folder. Type one word, such as Subtractive so the group as a whole cuts.',
      SOLID_SCRIPT_GROUP_MODE_WORDS,
    ),
    optional: true,
  };
}
