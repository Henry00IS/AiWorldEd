import { SolidScriptDictionary, type SolidScriptValue } from './solid_script_value.js';

/**
 * Lists and Dictionaries that lines may read but never change, such as the
 * value of an Input or a built-in value, with what they are for the message.
 */
const SOLID_SCRIPT_VALUES_READ_ONLY = new WeakMap<object, string>();

/**
 * Marks a value and every list and Dictionary inside it as one lines may read
 * but not change. A value already marked is left as it is.
 *
 * @param value Value to protect.
 * @param kind What holds it, such as input or built-in value.
 * @param name Name of what holds it, such as Heights or $Box.Size.
 * @returns The same value.
 */
export function solidScriptValueReadOnlyMark<Value extends SolidScriptValue>(
  value: Value,
  kind: string,
  name: string,
): Value {
  if (!solidScriptValueIsContainer(value) || SOLID_SCRIPT_VALUES_READ_ONLY.has(value)) return value;
  SOLID_SCRIPT_VALUES_READ_ONLY.set(value, `the ${kind} ${name}`);
  for (const inner of solidScriptValueInner(value)) solidScriptValueReadOnlyMark(inner, kind, name);
  return value;
}

/**
 * Stops a line that would change a list or Dictionary lines may only read.
 *
 * @param value List or Dictionary about to change.
 * @param shown Name the line changes it through, for the message.
 */
export function solidScriptValueEditCheck(value: SolidScriptValue, shown: string): void {
  if (!solidScriptValueIsContainer(value)) return;
  const origin = SOLID_SCRIPT_VALUES_READ_ONLY.get(value);
  if (origin === undefined) return;
  throw new Error(
    `[${shown}] is ${origin}, which can only be read; Copy it first, such as Copy [${shown}] Into [Mine], and change the copy`,
  );
}

/**
 * Stops a line that would put a list or Dictionary inside itself, which would
 * never end when it is shown or copied.
 *
 * @param target List or Dictionary that gets the value.
 * @param value Value going in.
 * @param shown Name of the target, for the message.
 */
export function solidScriptValueInsideCheck(target: SolidScriptValue, value: SolidScriptValue, shown: string): void {
  if (!solidScriptValueIsContainer(value) || !solidScriptValueHolds(value, target, new Set())) return;
  throw new Error(
    `this would put [${shown}] inside itself; Copy it first, such as Copy [${shown}] Into [Before], and add the copy`,
  );
}

/**
 * Tells whether a value is, or holds somewhere inside it, another value.
 *
 * @param value Value to search.
 * @param wanted Value to find.
 * @param seen Lists and Dictionaries already searched.
 * @returns True when it is found.
 */
function solidScriptValueHolds(value: SolidScriptValue, wanted: SolidScriptValue, seen: Set<object>): boolean {
  if (value === wanted) return true;
  if (!solidScriptValueIsContainer(value) || seen.has(value)) return false;
  seen.add(value);
  for (const inner of solidScriptValueInner(value)) if (solidScriptValueHolds(inner, wanted, seen)) return true;
  return false;
}

/**
 * Tells whether a value is a list or a Dictionary, the values that hold others.
 *
 * @param value Value.
 * @returns True for a list or a Dictionary.
 */
function solidScriptValueIsContainer(value: SolidScriptValue): value is SolidScriptValue[] | SolidScriptDictionary {
  return Array.isArray(value) || value instanceof SolidScriptDictionary;
}

/**
 * Lists the values directly inside a list or Dictionary.
 *
 * @param value List or Dictionary.
 * @returns Items, or the values under the keys.
 */
function solidScriptValueInner(value: SolidScriptValue[] | SolidScriptDictionary): Iterable<SolidScriptValue> {
  return Array.isArray(value) ? value : [...value.entries.values()].map((entry) => entry.value);
}
