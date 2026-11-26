/** Stored tag of a Dictionary kept between runs. */
export const SOLID_SCRIPT_PERSISTENT_DICTIONARY_KIND = 'dictionary';

/** Stored tag of a Rotation kept between runs. */
export const SOLID_SCRIPT_PERSISTENT_ROTATION_KIND = 'rotation';

/** One Dictionary entry as stored on a generator. */
export interface SolidScriptPersistentDictionaryEntry {
  /** Key as written, such as Wood. */
  name: string;
  /** Value under the key. */
  value: SolidScriptPersistentData;
}

/**
 * A Dictionary stored as its keys and values, so it can be saved and shared as
 * plain data.
 */
export interface SolidScriptPersistentDictionary {
  kind: typeof SOLID_SCRIPT_PERSISTENT_DICTIONARY_KIND;
  /** Entries in the order they were added. */
  entries: SolidScriptPersistentDictionaryEntry[];
}

/**
 * A Rotation stored as degrees around X, then Y, then Z, the same way
 * Rotation(x, y, z) writes it.
 */
export interface SolidScriptPersistentRotation {
  kind: typeof SOLID_SCRIPT_PERSISTENT_ROTATION_KIND;
  /** Degrees around X, then Y, then Z. */
  degrees: number[];
}

/**
 * A value kept between runs, as plain data a level or a multiplayer message can
 * hold: a number, text, Yes or No, a list of those, a Dictionary or a Rotation.
 * null stands for an empty list item.
 */
export type SolidScriptPersistentData =
  | number
  | string
  | boolean
  | null
  | SolidScriptPersistentData[]
  | SolidScriptPersistentDictionary
  | SolidScriptPersistentRotation;
