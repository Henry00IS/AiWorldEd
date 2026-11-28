import { curveFromData, curveToData } from '@/curve/model/curve_codec.js';
import { SolidScriptCurveValue } from '@/solid_script/language/solid_script_curve_value.js';
import { solidScriptRotationFromDegrees } from '@/solid_script/language/solid_script_functions_rotation.js';
import { solidScriptNameKey } from '@/solid_script/language/solid_script_name_key.js';
import {
  SolidScriptDictionary,
  SolidScriptRotation,
  type SolidScriptValue,
} from '@/solid_script/language/solid_script_value.js';
import {
  SOLID_SCRIPT_PERSISTENT_CURVE_KIND,
  SOLID_SCRIPT_PERSISTENT_DICTIONARY_KIND,
  SOLID_SCRIPT_PERSISTENT_ROTATION_KIND,
  type SolidScriptPersistentData,
  type SolidScriptPersistentDictionary,
  type SolidScriptPersistentDictionaryEntry,
  type SolidScriptPersistentRotation,
} from './solid_script_persistent_data.js';
import {
  solidScriptPersistentFirstForbidden,
  solidScriptPersistentKeepError,
} from './solid_script_persistent_error.js';
import { solidScriptNumberSafe } from '../solid_script_number_safe.js';

/**
 * Writes a value as the plain data a generator stores, or throws when the value
 * cannot be kept between runs.
 *
 * @param value Value to keep.
 * @param shown Persistent name as the script writes it, for the message.
 * @returns Stored data.
 */
export function solidScriptPersistentValueWrite(value: SolidScriptValue, shown: string): SolidScriptPersistentData {
  const written = solidScriptPersistentValueEncode(value);
  if (written !== undefined) return written;
  throw solidScriptPersistentKeepError(shown, value);
}

/**
 * Writes a value as stored data when it can be kept, including an empty list
 * item as null.
 *
 * @param value Value to keep.
 * @returns Stored data, or undefined when the value cannot be kept.
 */
export function solidScriptPersistentValueEncode(value: SolidScriptValue): SolidScriptPersistentData | undefined {
  if (solidScriptPersistentFirstForbidden(value) !== undefined) return undefined;
  return solidScriptPersistentValueEncodeKnown(value);
}

/**
 * Writes a value that can be kept as stored data.
 *
 * @param value Value that can be kept.
 * @returns Stored data.
 */
function solidScriptPersistentValueEncodeKnown(value: SolidScriptValue): SolidScriptPersistentData {
  if (typeof value === 'number') return value === 0 ? 0 : value;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map((item) => solidScriptPersistentValueEncodeKnown(item));
  if (value instanceof SolidScriptRotation) return solidScriptPersistentRotationEncode(value);
  if (value instanceof SolidScriptCurveValue)
    return { kind: SOLID_SCRIPT_PERSISTENT_CURVE_KIND, curve: curveToData(value.curve) };
  return solidScriptPersistentDictionaryEncode(value as SolidScriptDictionary);
}

/**
 * Writes a Rotation as its degrees around X, then Y, then Z, with no minus
 * zero.
 *
 * @param value Rotation that can be kept.
 * @returns Stored Rotation.
 */
function solidScriptPersistentRotationEncode(value: SolidScriptRotation): SolidScriptPersistentRotation {
  return {
    kind: SOLID_SCRIPT_PERSISTENT_ROTATION_KIND,
    degrees: value.degrees.map((part) => (part === 0 ? 0 : part)),
  };
}

/**
 * Writes a Dictionary as its keys and values in the order they were added.
 *
 * @param dictionary Dictionary that can be kept.
 * @returns Stored Dictionary.
 */
function solidScriptPersistentDictionaryEncode(dictionary: SolidScriptDictionary): SolidScriptPersistentDictionary {
  const entries: SolidScriptPersistentDictionaryEntry[] = [];
  for (const entry of dictionary.entries.values()) {
    entries.push({ name: entry.name, value: solidScriptPersistentValueEncodeKnown(entry.value) });
  }
  return { kind: SOLID_SCRIPT_PERSISTENT_DICTIONARY_KIND, entries };
}

/**
 * Reads a stored value back into a script value. Invalid data is ignored.
 *
 * @param data Stored data.
 * @returns Value, or undefined when the data is not a kept value.
 */
export function solidScriptPersistentValueRead(data: unknown): SolidScriptValue | undefined {
  if (data === null) return undefined;
  if (typeof data === 'number') return data === 0 ? 0 : solidScriptNumberSafe(data);
  if (typeof data === 'string' || typeof data === 'boolean') return data;
  if (Array.isArray(data)) return solidScriptPersistentListRead(data);
  return solidScriptPersistentObjectRead(data);
}

/**
 * Reads a stored list, skipping items that are not kept values.
 *
 * @param data Stored list.
 * @returns List of values that could be read.
 */
function solidScriptPersistentListRead(data: readonly unknown[]): SolidScriptValue[] {
  const values: SolidScriptValue[] = [];
  for (const item of data) {
    const value = solidScriptPersistentValueRead(item);
    if (item === null || value !== undefined) values.push(value);
  }
  return values;
}

/**
 * Reads a stored Dictionary, Rotation or Curve.
 *
 * @param data Stored object.
 * @returns Value, or undefined when the object is not one.
 */
function solidScriptPersistentObjectRead(data: unknown): SolidScriptValue | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const record = data as { kind?: unknown; degrees?: unknown; entries?: unknown; curve?: unknown };
  if (record.kind === SOLID_SCRIPT_PERSISTENT_CURVE_KIND) {
    const curve = curveFromData(record.curve);
    return curve ? new SolidScriptCurveValue(curve) : undefined;
  }
  if (record.kind === SOLID_SCRIPT_PERSISTENT_ROTATION_KIND) return solidScriptPersistentRotationRead(record.degrees);
  if (record.kind === SOLID_SCRIPT_PERSISTENT_DICTIONARY_KIND)
    return solidScriptPersistentDictionaryRead(record.entries);
  return undefined;
}

/**
 * Reads a Rotation from stored degrees around X, then Y, then Z.
 *
 * @param degrees Stored degrees.
 * @returns Rotation, or undefined when the degrees are not three finite
 *   numbers.
 */
function solidScriptPersistentRotationRead(degrees: unknown): SolidScriptValue | undefined {
  const numbers = solidScriptPersistentDegreesRead(degrees);
  if (!numbers) return undefined;
  const rotation = solidScriptRotationFromDegrees(numbers);
  return new SolidScriptRotation(rotation.quaternion, numbers);
}

/**
 * Reads three finite stored degrees, turning minus zero into zero.
 *
 * @param degrees Stored degrees.
 * @returns Degrees, or undefined when they are not three finite numbers.
 */
function solidScriptPersistentDegreesRead(degrees: unknown): number[] | undefined {
  if (!Array.isArray(degrees) || degrees.length !== 3) return undefined;
  const numbers = degrees.map((part) =>
    typeof part === 'number' && Number.isFinite(part) ? (part === 0 ? 0 : part) : NaN,
  );
  if (numbers.some((part) => !Number.isFinite(part))) return undefined;
  return numbers;
}

/**
 * Reads a Dictionary from stored keys and values, skipping entries that cannot
 * be read.
 *
 * @param entries Stored entries.
 * @returns Dictionary, or undefined when the entries are missing.
 */
function solidScriptPersistentDictionaryRead(entries: unknown): SolidScriptValue | undefined {
  if (!Array.isArray(entries)) return undefined;
  const dictionary = new SolidScriptDictionary();
  for (const entry of entries) solidScriptPersistentDictionaryEntryAdd(dictionary, entry);
  return dictionary;
}

/**
 * Adds one stored Dictionary entry when its key and value can be read.
 *
 * @param dictionary Dictionary being built.
 * @param entry Stored entry.
 */
function solidScriptPersistentDictionaryEntryAdd(dictionary: SolidScriptDictionary, entry: unknown): void {
  if (!entry || typeof entry !== 'object') return;
  const record = entry as { name?: unknown; value?: unknown };
  if (typeof record.name !== 'string') return;
  const name = record.name.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return;
  const value = solidScriptPersistentValueRead(record.value);
  if (record.value !== null && value === undefined) return;
  dictionary.entries.set(solidScriptNameKey(name), { name, value });
}
