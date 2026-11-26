import { solidScriptKindNamed } from '../solid_script_kinds.js';
import { SolidScriptDictionary, SolidScriptRotation, type SolidScriptValue } from '../solid_script_value.js';

/** What a persistent value may keep, for the message when it cannot. */
const SOLID_SCRIPT_PERSISTENT_ALLOWED = 'Keep a number, text, Yes or No, a list, a Dictionary or a Rotation instead.';

/**
 * Builds the error for a value that cannot be kept between runs.
 *
 * @param shown Persistent name as the script writes it, such as
 *   $Persistent.Count.
 * @param value Value that cannot be kept.
 * @returns Error.
 */
export function solidScriptPersistentKeepError(shown: string, value: SolidScriptValue): Error {
  return new Error(
    `[${shown}] can't be kept between runs, because ${solidScriptPersistentKeepReason(value)}. ${SOLID_SCRIPT_PERSISTENT_ALLOWED}`,
  );
}

/**
 * Says why a value cannot be kept, in beginner words.
 *
 * @param value Value that cannot be kept.
 * @returns Reason, such as "it is a Solid" or "it holds a Face".
 */
function solidScriptPersistentKeepReason(value: SolidScriptValue): string {
  const held = solidScriptPersistentHeldKind(value);
  if (held !== undefined) return `it holds ${held}`;
  if (typeof value === 'number' && !Number.isFinite(value)) return 'it is not a finite number';
  return `it is ${solidScriptKindNamed(value)}`;
}

/**
 * Names the first value inside a list or Dictionary that cannot be kept, or
 * none when the container itself is the problem.
 *
 * @param value Value being stored.
 * @returns Kind with an article, or undefined.
 */
function solidScriptPersistentHeldKind(value: SolidScriptValue): string | undefined {
  const found = solidScriptPersistentFirstForbidden(value);
  if (found === undefined || found === value) return undefined;
  return solidScriptKindNamed(found);
}

/**
 * Finds the first value that cannot be kept, searching lists and Dictionaries.
 *
 * @param value Value being stored.
 * @returns The forbidden value, or undefined when this value can be kept.
 */
export function solidScriptPersistentFirstForbidden(value: SolidScriptValue): SolidScriptValue | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? undefined : value;
  if (typeof value === 'string' || typeof value === 'boolean' || value === undefined) return undefined;
  if (value instanceof SolidScriptRotation) return undefined;
  if (Array.isArray(value)) return solidScriptPersistentFirstForbiddenIn(value);
  if (value instanceof SolidScriptDictionary)
    return solidScriptPersistentFirstForbiddenIn([...value.entries.values()].map((entry) => entry.value));
  return value;
}

/**
 * Finds the first value in a list that cannot be kept.
 *
 * @param values Items or Dictionary values.
 * @returns The forbidden value, or undefined when every item can be kept.
 */
function solidScriptPersistentFirstForbiddenIn(values: readonly SolidScriptValue[]): SolidScriptValue | undefined {
  for (const item of values) {
    const found = solidScriptPersistentFirstForbidden(item);
    if (found !== undefined) return found;
  }
  return undefined;
}
