/**
 * Names in SolidScript ignore case: [Count], [count] and [COUNT] are one
 * variable, and Face.Center is face.center. Every name is folded to its key
 * once, where it is compiled or first stored, so reads compare keys only.
 */

/** Folded keys by name as written; started over when it grows past its limit. */
const SOLID_SCRIPT_NAME_KEYS = new Map<string, string>();

/** Most names kept before the cache starts over. */
const SOLID_SCRIPT_NAME_KEYS_LIMIT = 8192;

/** Starts of names as stored and as taught. */
const SOLID_SCRIPT_NAME_PREFIXES: readonly (readonly [string, string])[] = [
  ['$local.', '$Local.'],
  ['$persistent.', '$Persistent.'],
];

/** Prefix of a variable that belongs to the Function it is used in. */
export const SOLID_SCRIPT_LOCAL_PREFIX = '$local.';

/**
 * Start of a variable kept with the generator between runs, such as
 * [$Persistent.Presses].
 */
export const SOLID_SCRIPT_PERSISTENT_PREFIX = '$persistent.';

/**
 * System names that hold the script's own names, written $Local.Name and
 * $Persistent.Name.
 */
export const SOLID_SCRIPT_NAME_SCOPES = ['$Local', '$Persistent'] as const;

/** A system name that holds the script's own names, such as $Local. */
export type SolidScriptNameScope = (typeof SOLID_SCRIPT_NAME_SCOPES)[number];

/**
 * Tells whether a name is a system name: it starts with $ and is not one of the
 * script's own $Local. or $Persistent. names.
 *
 * @param name Name as written or as a key.
 * @returns True for a system value such as $Box.Size.
 */
export function solidScriptNameIsSystem(name: string): boolean {
  if (!name.startsWith('$')) return false;
  const lower = name.toLowerCase();
  return !SOLID_SCRIPT_NAME_PREFIXES.some(([folded]) => lower.startsWith(folded));
}

/**
 * Returns the key a name is stored and looked up under.
 *
 * @param name Name as written, such as StepHeight or $local.Count.
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
 * Spells a name key for a message or the debugger as it was written, with
 * $Local. and $Persistent. as taught, such as $Local.Width for $Local.Width.
 *
 * @param key Key.
 * @param written Finds how a key was written, or undefined.
 * @returns Spelling.
 */
export function solidScriptNameSpelling(key: string, written: (key: string) => string | undefined): string {
  const prefix = SOLID_SCRIPT_NAME_PREFIXES.find(([folded]) => key.startsWith(folded));
  if (!prefix) return written(key) ?? key;
  const bare = key.slice(prefix[0].length);
  return prefix[1] + (written(bare) ?? written(key)?.slice(prefix[0].length) ?? bare);
}

/**
 * Finds the first spelling of a name key in some texts, as a whole name: not
 * part of a longer name or after a dot.
 *
 * @param key Key.
 * @param texts Texts to search, such as the field texts of a script.
 * @returns Spelling, or undefined when none of the texts has it.
 */
export function solidScriptNameFind(key: string, texts: Iterable<string>): string | undefined {
  const pattern = new RegExp(`(?<![\\w.])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`, 'i');
  for (const text of texts) {
    const found = pattern.exec(text);
    if (found) return found[0];
  }
  return undefined;
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
