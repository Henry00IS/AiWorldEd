import { SOLID_SCRIPT_PERSISTENT_PREFIX } from '../solid_script_name_key.js';
import { solidScriptNameKey } from '../solid_script_name_key.js';
import type { SolidScriptValue } from '../solid_script_value.js';
import {
  solidScriptPersistentValueEncode,
  solidScriptPersistentValueRead,
  solidScriptPersistentValueWrite,
} from './solid_script_persistent_codec.js';
import type { SolidScriptPersistentData } from './solid_script_persistent_data.js';

/** Persistent values stored on a generator, by folded bare name. */
export type SolidScriptPersistentRecord = Record<string, SolidScriptPersistentData>;

/**
 * Reads the persistent values stored on a generator: the structured record, or
 * older maps that kept them among the input values as JSON text.
 *
 * @param stored Structured record, or unknown data from a level.
 * @param inputs Stored input values, which may still hold older persistent
 *   keys.
 * @returns Values by folded bare name.
 */
export function solidScriptPersistentRecordRead(
  stored: unknown,
  inputs: Readonly<Record<string, string>> = {},
): Map<string, SolidScriptValue> {
  const values = new Map<string, SolidScriptValue>();
  solidScriptPersistentRecordReadStored(stored, values);
  solidScriptPersistentRecordReadLegacy(inputs, values);
  return values;
}

/**
 * Reads the structured record into a map, ignoring names already set and data
 * that cannot be read.
 *
 * @param stored Structured record, or unknown data.
 * @param values Values collected so far.
 */
function solidScriptPersistentRecordReadStored(stored: unknown, values: Map<string, SolidScriptValue>): void {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return;
  for (const [name, data] of Object.entries(stored as Record<string, unknown>)) {
    const key = solidScriptNameKey(name);
    if (key === '' || values.has(key)) continue;
    const value = solidScriptPersistentValueRead(data);
    if (value !== undefined) values.set(key, value);
  }
}

/**
 * Reads older persistent values kept as JSON text among the input values, only
 * for names the structured record did not already provide.
 *
 * @param inputs Stored input values.
 * @param values Values collected so far.
 */
function solidScriptPersistentRecordReadLegacy(
  inputs: Readonly<Record<string, string>>,
  values: Map<string, SolidScriptValue>,
): void {
  for (const [name, text] of Object.entries(inputs)) {
    if (!name.startsWith(SOLID_SCRIPT_PERSISTENT_PREFIX)) continue;
    const key = solidScriptNameKey(name.slice(SOLID_SCRIPT_PERSISTENT_PREFIX.length));
    if (key === '' || values.has(key)) continue;
    const value = solidScriptPersistentLegacyRead(text);
    if (value !== undefined) values.set(key, value);
  }
}

/**
 * Reads one older stored JSON text: a number, text, Yes or No, a list of those,
 * or a Rotation or Dictionary in the current form.
 *
 * @param text Stored JSON text, or the text itself when it is not JSON.
 * @returns Value, or undefined when the text holds nothing that can be kept.
 */
function solidScriptPersistentLegacyRead(text: string): SolidScriptValue | undefined {
  try {
    return solidScriptPersistentValueRead(JSON.parse(text));
  } catch {
    return text;
  }
}

/**
 * Writes current persistent values as the structured record a generator stores.
 *
 * @param values Values by bare name.
 * @param shown Name as the script writes it, for a value that cannot be kept.
 * @returns Structured record by folded bare name.
 */
export function solidScriptPersistentRecordWrite(
  values: ReadonlyMap<string, SolidScriptValue>,
  shown: (name: string) => string,
): SolidScriptPersistentRecord {
  const record: SolidScriptPersistentRecord = {};
  for (const [name, value] of values) {
    record[solidScriptNameKey(name)] = solidScriptPersistentValueWrite(value, shown(name));
  }
  return record;
}

/**
 * Writes one changed persistent value into a record, or marks it removed when
 * the name no longer has a value.
 *
 * @param record Record of values already kept this handler.
 * @param removed Names this handler deleted.
 * @param name Folded bare name.
 * @param value Value to keep, or undefined when the name was deleted.
 * @param shown Name as the script writes it, for the message.
 */
export function solidScriptPersistentRecordKeep(
  record: SolidScriptPersistentRecord,
  removed: Set<string>,
  name: string,
  value: SolidScriptValue | undefined,
  shown: string,
): void {
  const key = solidScriptNameKey(name);
  if (value === undefined) {
    delete record[key];
    removed.add(key);
    return;
  }
  record[key] = solidScriptPersistentValueWrite(value, shown);
  removed.delete(key);
}

/**
 * Splits a generator's stored parameters into input values and a structured
 * persistent record, moving older persistent keys out of the inputs.
 *
 * @param stored Structured record already on the generator, if any.
 * @param inputs Stored input values, which may still hold older persistent
 *   keys.
 * @returns Inputs without older persistent keys, and the structured record.
 */
export function solidScriptPersistentParametersNormalize(
  stored: unknown,
  inputs: Readonly<Record<string, string>>,
): { inputs: Record<string, string>; persistent: SolidScriptPersistentRecord } {
  const values = solidScriptPersistentRecordRead(stored, inputs);
  const persistent: SolidScriptPersistentRecord = {};
  for (const [name, value] of values) {
    const data = solidScriptPersistentValueEncode(value);
    if (data !== undefined) persistent[name] = data;
  }
  return { inputs: solidScriptPersistentInputsWithoutLegacy(inputs), persistent };
}

/**
 * Returns input values with older persistent keys taken out.
 *
 * @param inputs Stored input values.
 * @returns Input values of the Input lines only.
 */
export function solidScriptPersistentInputsWithoutLegacy(
  inputs: Readonly<Record<string, string>>,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [name, value] of Object.entries(inputs)) {
    if (!name.startsWith(SOLID_SCRIPT_PERSISTENT_PREFIX)) next[name] = value;
  }
  return next;
}

/**
 * Applies what a handler set or deleted to a stored persistent record.
 *
 * @param stored Record already on the generator.
 * @param changed Values the handler set, as stored data.
 * @param removed Folded bare names the handler deleted.
 * @returns Record to store.
 */
export function solidScriptPersistentRecordApply(
  stored: Readonly<Record<string, unknown>>,
  changed: Readonly<Record<string, unknown>>,
  removed: readonly string[],
): SolidScriptPersistentRecord {
  const next: SolidScriptPersistentRecord = {};
  const forgotten = new Set(removed.map((name) => solidScriptNameKey(name)));
  for (const [name, data] of Object.entries({ ...stored, ...changed })) {
    const key = solidScriptNameKey(name);
    if (forgotten.has(key) || key === '') continue;
    if (solidScriptPersistentValueRead(data) !== undefined) next[key] = data as SolidScriptPersistentData;
  }
  return next;
}
