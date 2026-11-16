/**
 * Names in SolidScript ignore case: [Count], [count] and [COUNT] are one
 * variable, and Face.Center is face.center. Every name is folded to its key
 * once, where it is compiled or first stored, so reads compare keys only.
 */

/** Folded keys by name as written; started over when it grows past its limit. */
const SOLID_SCRIPT_NAME_KEYS = new Map<string, string>();

/** Most names kept before the cache starts over. */
const SOLID_SCRIPT_NAME_KEYS_LIMIT = 8192;

/**
 * Returns the key a name is stored and looked up under.
 *
 * @param name Name as written, such as StepHeight or local.Count.
 * @returns Key, such as stepheight.
 */
export function solidScriptNameKey(name: string): string {
  let key = SOLID_SCRIPT_NAME_KEYS.get(name);
  if (key === undefined) {
    if (SOLID_SCRIPT_NAME_KEYS.size >= SOLID_SCRIPT_NAME_KEYS_LIMIT) SOLID_SCRIPT_NAME_KEYS.clear();
    key = name.toLowerCase();
    SOLID_SCRIPT_NAME_KEYS.set(name, key);
  }
  return key;
}

/**
 * Returns the key of a built-in function name: case and underscores do not
 * count, so CharacterCode, characterCode and character_code are one function.
 *
 * @param name Function name as written.
 * @returns Key.
 */
export function solidScriptFunctionKey(name: string): string {
  return solidScriptNameKey(name).replaceAll('_', '');
}

/**
 * Returns the Start Case spelling the docs teach for a built-in function name,
 * such as CharacterCode for character_code and Sin for sin.
 *
 * @param name Stored name.
 * @returns Spelling.
 */
export function solidScriptFunctionSpelling(name: string): string {
  return name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
