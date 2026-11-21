import type { SolidScriptCommandParameter } from './solid_script_command.js';
import { solidScriptNameIsPositionWrite } from '@/solid_script/language/solid_script_name_rules.js';
import { solidScriptEachUsed } from '@/solid_script/language/solid_script_each_uses.js';
import {
  solidScriptSystemFill,
  type SolidScriptSystemFillName,
} from '@/solid_script/language/solid_script_system_names.js';

/** Element a per-element field is worked out for, once each. */
export type SolidScriptCommandEach = 'Object' | 'Face' | 'Edge' | 'Vertex' | 'Point' | 'Item';

/** Icon shown on a field worked out once per element. */
export const SOLID_SCRIPT_COMMAND_EACH_ICON = '🔁';

/** Official fills of the current element, by the element kind. */
const SOLID_SCRIPT_COMMAND_EACH_FILLS: Readonly<Record<SolidScriptCommandEach, readonly SolidScriptSystemFillName[]>> =
  {
    Object: ['$Object', '$Index', '$Count', '$X', '$Y', '$Z'],
    Face: ['$Face', '$Index', '$Count', '$X', '$Y', '$Z', '$NX', '$NY', '$NZ'],
    Edge: ['$Edge', '$Index', '$Count', '$X', '$Y', '$Z'],
    Vertex: ['$Vertex', '$Index', '$Count', '$X', '$Y', '$Z', '$NX', '$NY', '$NZ'],
    Point: ['$Point', '$Index', '$Count', '$X', '$Y', '$Z', '$NX', '$NY', '$NZ'],
    Item: ['$Item', '$Index', '$Count', '$X', '$Y', '$Z'],
  };

/** How the help names each kind of item and what its $X, $Y and $Z read. */
const SOLID_SCRIPT_COMMAND_EACH_WORDS: Readonly<
  Record<SolidScriptCommandEach, { noun: string; place: string; normal: boolean }>
> = {
  Object: { noun: 'object', place: 'its center', normal: false },
  Face: { noun: 'face', place: 'its center', normal: true },
  Edge: { noun: 'edge', place: 'its center', normal: false },
  Vertex: { noun: 'corner', place: 'its position', normal: true },
  Point: { noun: 'point', place: 'its position', normal: true },
  Item: { noun: 'item', place: 'its parts when it is a vector, or its center', normal: false },
};

/**
 * Explains what a per-item field may read for one kind of item, such as
 * [$Face], [$Index] and [$Count] and the short forms.
 *
 * @param each Kind of item.
 * @returns Sentence.
 */
export function solidScriptEachSentence(each: SolidScriptCommandEach): string {
  const words = SOLID_SCRIPT_COMMAND_EACH_WORDS[each];
  const normal = words.normal ? ', and [$NX], [$NY] and [$NZ] its normal' : '';
  return `Can change per ${words.noun}: [$${each}] is the ${words.noun}, [$Index] its number from 0 and [$Count] how many there are; [$X], [$Y] and [$Z] are ${words.place}${normal}.`;
}

/**
 * Makes a field per-item for one kind of item: it may read that item's values,
 * and its hint ends with what it may read.
 *
 * @param parameter Field.
 * @param each Kind of item.
 * @param eachWhen Field and words that make it per-item, when it is only
 *   per-item then.
 * @returns Field.
 */
export function solidScriptParameterEach(
  parameter: SolidScriptCommandParameter,
  each: SolidScriptCommandEach,
  eachWhen?: SolidScriptCommandParameter['eachWhen'],
): SolidScriptCommandParameter {
  return {
    ...parameter,
    hint: `${parameter.hint} ${solidScriptEachSentence(each)}`,
    each,
    ...(eachWhen ? { eachWhen } : {}),
  };
}

/**
 * Lists the fills of a line: the current-item names of every field that may
 * always be per-item, each once; a field per-item only for some values, such as
 * Set's Value, adds its names while it is.
 *
 * @param parameters Fields of the line.
 * @returns Official fill names.
 */
export function solidScriptCommandFillsOf(
  parameters: readonly SolidScriptCommandParameter[],
): readonly SolidScriptSystemFillName[] {
  return [
    ...new Set(
      parameters.flatMap((parameter) =>
        parameter.each && !parameter.eachWhen ? SOLID_SCRIPT_COMMAND_EACH_FILLS[parameter.each] : [],
      ),
    ),
  ];
}

/** Current-element fill names, folded, including short forms and $Index. */
const SOLID_SCRIPT_COMMAND_EACH_FILL_KEYS: ReadonlySet<string> = new Set(
  Object.values(SOLID_SCRIPT_COMMAND_EACH_FILLS)
    .flat()
    .map((name) => name.toLowerCase()),
);

/**
 * Tells which items a field may be worked out for with the line's current
 * values, such as Value of Set when Variable is a Position write, so the field
 * offers [$Vertex] and the other per-item values.
 *
 * @param parameter Field.
 * @param values Stored values of the line.
 * @returns The item kind, or undefined when the field cannot change per item
 *   now.
 */
export function solidScriptParameterEachKind(
  parameter: SolidScriptCommandParameter,
  values: Readonly<Record<string, string>>,
): SolidScriptCommandEach | undefined {
  if (!parameter.each) return undefined;
  const when = parameter.eachWhen;
  if (!when) return parameter.each;
  const held = values[when.field] ?? '';
  if (when.position && solidScriptNameIsPositionWrite(held)) return parameter.each;
  return when.words?.some((word) => word.toLowerCase() === held.trim().toLowerCase()) ? parameter.each : undefined;
}

/**
 * Tells whether a field is worked out once per item: it may change per item and
 * its text reads a per-item value, such as [=[$Y] * 0.1] in Distance of
 * Displace. Such a field gets the 🔁 marker.
 *
 * @param parameter Field.
 * @param values Stored values of the line.
 * @returns The item kind, or undefined when the field is worked out once.
 */
export function solidScriptParameterEachActive(
  parameter: SolidScriptCommandParameter,
  values: Readonly<Record<string, string>>,
): SolidScriptCommandEach | undefined {
  const each = solidScriptParameterEachKind(parameter, values);
  return each && solidScriptEachUsed(values[parameter.key] ?? '') ? each : undefined;
}

/**
 * Lists the fills a per-element field may use, such as $Face and $Index on a
 * Face field.
 *
 * @param each Element kind.
 * @returns Official fill names.
 */
export function solidScriptParameterEachFills(each: SolidScriptCommandEach): readonly SolidScriptSystemFillName[] {
  return SOLID_SCRIPT_COMMAND_EACH_FILLS[each];
}

/**
 * Tells whether a system name is a current-element fill, such as $Vertex or
 * $Index, including short forms such as $X.
 *
 * @param name Name as written.
 * @returns True for a current-element fill.
 */
export function solidScriptSystemFillEach(name: string): boolean {
  const official = solidScriptSystemFill(name)?.name ?? name;
  return SOLID_SCRIPT_COMMAND_EACH_FILL_KEYS.has(official.toLowerCase());
}

/**
 * Lists every fill a line has: the command's own fills, plus the
 * current-element names of any field that is per-element for these values.
 * Autocomplete and the analyzer use solidScriptCommandFieldFills for one
 * field.
 *
 * @param command Command of the line.
 * @param values Stored values of the line.
 * @returns Official fill names, each once.
 */
export function solidScriptCommandEachFills(
  command: { fills: readonly string[]; parameters: readonly SolidScriptCommandParameter[] },
  values: Readonly<Record<string, string>>,
): readonly string[] {
  const extra = command.parameters.flatMap((parameter) => {
    const each = solidScriptParameterEachKind(parameter, values);
    return each ? [...solidScriptParameterEachFills(each)] : [];
  });
  return [...new Set([...command.fills, ...extra])];
}

/**
 * Lists the fills one field may use. Per-item names such as $Object and $Index
 * are only included while that field can change per item.
 *
 * @param command Command of the line.
 * @param parameter Field.
 * @param values Stored values of the line.
 * @returns Official fill names, each once.
 */
export function solidScriptCommandFieldFills(
  command: { fills: readonly string[]; parameters: readonly SolidScriptCommandParameter[] },
  parameter: SolidScriptCommandParameter,
  values: Readonly<Record<string, string>>,
): readonly string[] {
  const each = solidScriptParameterEachKind(parameter, values);
  const eachFills = each ? [...solidScriptParameterEachFills(each)] : [];
  const shared = command.fills.filter((name) => !solidScriptSystemFillEach(name));
  return [...new Set([...shared, ...eachFills])];
}
