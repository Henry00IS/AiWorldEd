import { SOLID_SCRIPT_SYSTEM_GLOBALS } from './solid_script_system.js';

/**
 * Which names may contain a dot. A script's own names use letters, digits and _
 * only; a dot reads a member, such as Face.Centre, Faces.Count, Pos.X or
 * Face.Data.Height, and Local. and Persistent. go in front of a name. System
 * values start with $, such as $Selected.Faces or $Box.Width.
 */

/** System values by group, without the $, such as Box: Width. */
export const SOLID_SCRIPT_SYSTEM_VALUES: Readonly<Record<string, readonly string[]>> = solidScriptSystemGroups({
  Selected: ['Brushes', 'Faces', 'Edges', 'Vertices'],
});

/**
 * Adds the built-in values every script can read, such as Time.Year, to the
 * system lists.
 *
 * @param lists System lists by group.
 * @returns Every system value by group.
 */
function solidScriptSystemGroups(lists: Record<string, string[]>): Record<string, string[]> {
  for (const { name } of SOLID_SCRIPT_SYSTEM_GLOBALS) {
    const [group = '', member = ''] = name.split('.');
    (lists[group] ??= []).push(member);
  }
  return lists;
}

/**
 * Spellings of the system values by their key without the $, as names ignore
 * case.
 */
const SOLID_SCRIPT_SYSTEM_SPELLINGS: ReadonlyMap<string, string> = new Map(
  Object.entries(SOLID_SCRIPT_SYSTEM_VALUES).flatMap(([group, members]) =>
    members.map((member) => [`${group}.${member}`.toLowerCase(), `${group}.${member}`] as const),
  ),
);

/**
 * One part of a dotted name: a name, maybe with an item number such as
 * Edges(0).
 */
const SOLID_SCRIPT_NAME_PART = /^[A-Za-z_]\w*\s*(\(.*\))?$/s;

/** A name of the script set as a whole, with an optional prefix and vector part. */
const SOLID_SCRIPT_NAME_OWN = /^(local\.|persistent\.)?[A-Za-z_]\w*\s*(\(.*\))?(\.[xyzXYZ])?$/is;

/** The [$Selected.*] lists, the only system values a line may set. */
const SOLID_SCRIPT_NAME_SELECTED = /^\$selected\.(brushes|faces|edges|vertices)$/i;

/**
 * Splits a name at its dots outside brackets.
 *
 * @param name Name.
 * @returns Parts.
 */
function solidScriptNameParts(name: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < name.length; index++) {
    const character = name[index];
    if (character === '(' || character === '[') depth++;
    else if (character === ')' || character === ']') depth--;
    else if (character === '.' && depth === 0) {
      parts.push(name.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(name.slice(start).trim());
  return parts;
}

/**
 * Checks a name with a dot in it, as a field reads it or a line sets it. Names
 * without a dot are left to the other checks.
 *
 * @param name Name as written, without brackets.
 * @param use Whether a field reads it or a line sets it.
 * @returns Problem in plain words, or an empty string.
 */
export function solidScriptNameDotProblem(name: string, use: 'read' | 'set'): string {
  const text = name.trim();
  if (!text.includes('.')) return '';
  if (text.startsWith('$')) {
    if (use === 'set' && !SOLID_SCRIPT_NAME_SELECTED.test(text))
      return `${text} is a system value and can only be read; only the $Selected lists can be set`;
    return '';
  }
  const parts = solidScriptNameParts(text);
  const last = parts.length - 1;
  const bad = parts.find(
    (part, index) => !SOLID_SCRIPT_NAME_PART.test(part) && !(index === last && /^\[.*\]$/s.test(part)),
  );
  if (bad !== undefined)
    return `"${text}" cannot be a name: names use letters, digits and _, and a dot reads a member such as Face.Centre, Pos.X or Face.Data.Height`;
  if (
    use === 'read' ||
    SOLID_SCRIPT_NAME_OWN.test(text) ||
    solidScriptNameIsDataWrite(text) ||
    solidScriptNameIsUvWrite(text)
  )
    return '';
  if (parts.length >= 2 && parts[last]?.toLowerCase() === 'data')
    return `${text} needs a key to set, such as ${text}.Height; a line sets a value under .Data, not .Data itself`;
  return `${text} can only be read; a line sets whole names, .X, .Y and .Z of a vector, Face.UVs, or a value under .Data such as Face.Data.Height or Brush.Edges.Data.Kind`;
}

/**
 * Tells whether a name sets a value under .Data, such as Face.Data.Height,
 * Brush.Edges.Data.Kind or Sides(0).Data.[Key]: a value or member path, then
 * Data, then one key.
 *
 * @param name Name as written, without brackets.
 * @returns True for such a name.
 */
export function solidScriptNameIsDataWrite(name: string): boolean {
  const parts = solidScriptNameParts(name.trim());
  return parts.length >= 3 && parts[parts.length - 2]?.toLowerCase() === 'data';
}

/**
 * Tells whether a system value is a vector.
 *
 * @param name Name as written, such as $Box.Size or $Box.Size.X.
 * @returns True or false for a system value, null for any other name.
 */
export function solidScriptSystemIsVector(name: string): boolean | null {
  if (!name.startsWith('$')) return null;
  const [group = '', member = '', part] = name.slice(1).toLowerCase().split('.');
  if (!SOLID_SCRIPT_SYSTEM_SPELLINGS.has(`${group}.${member}`)) return null;
  if (part !== undefined) return /^[xyz]$/.test(part) ? false : null;
  const global = SOLID_SCRIPT_SYSTEM_GLOBALS.find((value) => value.name.toLowerCase() === `${group}.${member}`);
  return global ? global.type === 'Vector' : false;
}

/**
 * Tells whether a name sets Face.UVs or a list of faces' UVs, such as Face.UVs
 * or Sides.UVs.
 *
 * @param name Name as written, without brackets.
 * @returns True for such a name.
 */
export function solidScriptNameIsUvWrite(name: string): boolean {
  const parts = solidScriptNameParts(name.trim());
  return parts.length >= 2 && parts[parts.length - 1]?.toLowerCase() === 'uvs';
}
