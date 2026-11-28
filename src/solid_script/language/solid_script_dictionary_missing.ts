import type { SolidScriptDictionary } from './solid_script_value.js';

/** Most keys a missing-key warning lists before it only counts them. */
const SOLID_SCRIPT_DICTIONARY_MISSING_KEYS_LISTED = 8;

/**
 * Builds the warning of a Dictionary read under a key it does not have, such as
 * There is no key "Wod" in the Dictionary, so it reads as empty text; it has
 * Wood, Stone.
 *
 * @param dictionary Dictionary read.
 * @param written Key as written.
 * @returns Warning text.
 */
export function solidScriptDictionaryMissingText(dictionary: SolidScriptDictionary, written: string): string {
  return `There is no key "${written}" in the Dictionary, so it reads as empty text; ${solidScriptDictionaryMissingKeys(dictionary)}.`;
}

/**
 * Names the keys of a Dictionary for a warning: all of them when there are few,
 * otherwise how many.
 *
 * @param dictionary Dictionary.
 * @returns Text such as it has Wood, Stone.
 */
function solidScriptDictionaryMissingKeys(dictionary: SolidScriptDictionary): string {
  const names = [...dictionary.entries.values()].map((entry) => entry.name);
  if (names.length === 0) return 'it has no keys yet';
  if (names.length > SOLID_SCRIPT_DICTIONARY_MISSING_KEYS_LISTED) return `it has ${names.length} keys`;
  return `it has ${names.join(', ')}`;
}
