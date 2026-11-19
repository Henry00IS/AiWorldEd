import type { SolidScriptCommandParameter } from './solid_script_command.js';
import { solidScriptNameIsPositionWrite } from '@/solid_script/language/solid_script_name_rules.js';
import {
  solidScriptSystemFill,
  type SolidScriptSystemFillName,
} from '@/solid_script/language/solid_script_system_names.js';

/** Element a per-element field is worked out for, once each. */
export type SolidScriptCommandEach = 'Face' | 'Edge' | 'Vertex' | 'Point';

/** Icon shown on a field worked out once per element. */
export const SOLID_SCRIPT_COMMAND_EACH_ICON = '🔁';

/** Official fills of the current element, by the element kind. */
const SOLID_SCRIPT_COMMAND_EACH_FILLS: Readonly<Record<SolidScriptCommandEach, readonly SolidScriptSystemFillName[]>> =
  {
    Face: ['$Face', '$Index', '$CX', '$CY', '$CZ', '$NX', '$NY', '$NZ'],
    Edge: ['$Edge', '$Index'],
    Vertex: ['$Vertex', '$Index', '$X', '$Y', '$Z', '$NX', '$NY', '$NZ'],
    Point: ['$Point', '$Index', '$X', '$Y', '$Z'],
  };

/** Current-element fill names, folded, including short forms and $Index. */
const SOLID_SCRIPT_COMMAND_EACH_FILL_KEYS: ReadonlySet<string> = new Set(
  Object.values(SOLID_SCRIPT_COMMAND_EACH_FILLS)
    .flat()
    .map((name) => name.toLowerCase()),
);

/**
 * Tells whether a field is worked out once per element for the line's current
 * values, such as Detail of Select Faces when Which is Where.
 *
 * @param parameter Field.
 * @param values Stored values of the line.
 * @returns The element kind, or undefined when the field is not per-element
 *   now.
 */
export function solidScriptParameterEachActive(
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
 * Lists the fills a line may use in its fields: the command's own fills, plus
 * the current-element names of any field that is per-element for these values.
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
    const each = solidScriptParameterEachActive(parameter, values);
    return each ? [...solidScriptParameterEachFills(each)] : [];
  });
  return [...new Set([...command.fills, ...extra])];
}
