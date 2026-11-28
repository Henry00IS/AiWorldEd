import { solidScriptValueInsideCheck } from './solid_script_value_share.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import { SOLID_SCRIPT_NAME } from './solid_script_machine_variables.js';
import {
  SolidScriptDictionary,
  solidScriptValueShow,
  type SolidScriptDictionaryEntry,
  type SolidScriptValue,
} from './solid_script_value.js';

/** A key of a Dictionary: as the script wrote it and folded for lookups. */
export interface SolidScriptDictionaryKey {
  /** Key as written, such as Wood. */
  readonly name: string;
  /** Key folded for lookups, so Wood and wood are one. */
  readonly key: string;
}

/**
 * Checks a key: letters, digits and _, not starting with a digit, so it reads
 * back as [Prices.Wood].
 *
 * @param text Key as typed or worked out.
 * @param usage The function or line, for the message.
 * @returns The key.
 */
export function solidScriptDictionaryKey(text: string, usage: string): SolidScriptDictionaryKey {
  const name = text.trim();
  if (name === '') throw new Error(`${usage} needs a key, such as Wood`);
  if (!SOLID_SCRIPT_NAME.test(name))
    throw new Error(`${usage}: "${name}" cannot be a key; keys use letters, digits and _, not starting with a digit`);
  return { name, key: solidScriptNameKey(name) };
}

/**
 * Puts a value under a key, replacing what was there; a new key goes last.
 *
 * @param dictionary Dictionary to change.
 * @param key Checked key.
 * @param value Value to store.
 * @param shown Name of the Dictionary, to check it does not go inside itself;
 *   none for a new Dictionary.
 */
export function solidScriptDictionaryAdd(
  dictionary: SolidScriptDictionary,
  key: SolidScriptDictionaryKey,
  value: SolidScriptValue,
  shown?: string,
): void {
  if (shown !== undefined) solidScriptValueInsideCheck(dictionary, value, shown);
  dictionary.entries.set(key.key, { name: key.name, value });
}

/**
 * Takes a key out; a key that is not there changes nothing.
 *
 * @param dictionary Dictionary to change.
 * @param key Checked key.
 * @returns True when the key was there.
 */
export function solidScriptDictionaryRemove(dictionary: SolidScriptDictionary, key: SolidScriptDictionaryKey): boolean {
  return dictionary.entries.delete(key.key);
}

/**
 * Reads the Dictionary a line merges from.
 *
 * @param value Value of the From field.
 * @param usage The line, for the message.
 * @returns Its entries, copied so merging a Dictionary into itself is safe.
 */
export function solidScriptDictionarySource(value: SolidScriptValue, usage: string): SolidScriptDictionaryEntry[] {
  if (!(value instanceof SolidScriptDictionary))
    throw new Error(`${usage} needs a Dictionary in From, such as [Extra], not ${solidScriptValueShow(value)}`);
  return [...value.entries.values()];
}

/**
 * Adds every entry of another Dictionary; keys both have take the new value,
 * and new keys go last in the order they come.
 *
 * @param dictionary Dictionary to change.
 * @param entries Entries to add.
 * @param shown Name of the Dictionary, for messages.
 */
export function solidScriptDictionaryMerge(
  dictionary: SolidScriptDictionary,
  entries: readonly SolidScriptDictionaryEntry[],
  shown: string,
): void {
  for (const entry of entries)
    solidScriptDictionaryAdd(dictionary, { name: entry.name, key: solidScriptNameKey(entry.name) }, entry.value, shown);
}
