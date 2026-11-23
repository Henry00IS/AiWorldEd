import { solidScriptExtraText } from './solid_script_functions_extra.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import { SOLID_SCRIPT_NAME } from './solid_script_machine_variables.js';
import {
  SolidScriptDictionary,
  solidScriptValueShow,
  solidScriptValueText,
  type SolidScriptValue,
} from './solid_script_value.js';

/** Built-in function implementation over evaluated positional arguments. */
type SolidScriptBuiltin = (args: SolidScriptValue[]) => SolidScriptValue;

/**
 * Reads a Dictionary argument.
 *
 * @param value Argument.
 * @param usage How to call the function, for the message.
 * @returns The Dictionary.
 */
function solidScriptDictionaryRead(value: SolidScriptValue, usage: string): SolidScriptDictionary {
  if (value instanceof SolidScriptDictionary) return value;
  throw new Error(`${usage} needs a Dictionary, such as [Prices] or [Box.Data], not ${solidScriptValueShow(value)}`);
}

/**
 * Says whether a list holds an item, compared as text so [3, 4] finds a vector,
 * a Dictionary a key, or a text a piece.
 *
 * @param args The list, Dictionary or text, then the item.
 * @returns Yes when it is there.
 */
function solidScriptContains(args: SolidScriptValue[]): boolean {
  const usage = 'Contains(list or text, item)';
  const within = args[0];
  const wanted = solidScriptExtraText(args, 1, usage);
  if (Array.isArray(within)) return within.some((item) => solidScriptValueText(item) === wanted);
  if (within instanceof SolidScriptDictionary) return within.entries.has(solidScriptNameKey(wanted));
  return solidScriptExtraText(args, 0, usage).includes(wanted);
}

/**
 * Builds a Dictionary from a list of keys and a list of values in the same
 * order.
 *
 * @param keys Keys.
 * @param values A value for each key.
 * @param usage The function or line, for messages.
 * @returns The Dictionary.
 */
export function solidScriptDictionaryFrom(
  keys: SolidScriptValue,
  values: SolidScriptValue,
  usage: string,
): SolidScriptDictionary {
  if (!Array.isArray(keys) || !Array.isArray(values) || keys.length !== values.length)
    throw new Error(`${usage} needs two lists of the same length, such as List("Wood", "Stone") and List(5, 7)`);
  const made = new SolidScriptDictionary();
  for (const [index, key] of keys.entries()) {
    const name = solidScriptValueText(key).trim();
    if (!SOLID_SCRIPT_NAME.test(name))
      throw new Error(`${usage}: "${name}" cannot be a key; keys use letters, digits and _, not starting with a digit`);
    made.entries.set(solidScriptNameKey(name), { name, value: values[index] });
  }
  return made;
}

/** Functions that build and read a Dictionary, and Contains. */
export const SOLID_SCRIPT_FUNCTIONS_DICTIONARY = {
  contains: solidScriptContains,
  dictionary: (args) => solidScriptDictionaryFrom(args[0] ?? [], args[1] ?? [], 'Dictionary(keys, values)'),
  keys: (args) => [...solidScriptDictionaryRead(args[0], 'Keys(dictionary)').entries.values()].map((e) => e.name),
  values: (args) => [...solidScriptDictionaryRead(args[0], 'Values(dictionary)').entries.values()].map((e) => e.value),
} as const satisfies Readonly<Record<string, SolidScriptBuiltin>>;
