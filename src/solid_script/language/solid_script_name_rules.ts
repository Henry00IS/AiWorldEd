import { SOLID_SCRIPT_SYSTEM_GLOBALS } from './solid_script_system.js';

/**
 * Which names may contain a dot. A script's own names use letters, digits and _
 * only; a dot only appears where SolidScript gives it a meaning: local. and
 * persistent. in front of a name, .x, .y and .z behind a vector, ().count
 * behind a list, and the read-only values of face, corner and edge loops such
 * as Face.Center.
 */

/** Read-only values the loops give, by group. */
export const SOLID_SCRIPT_SYSTEM_VALUES: Readonly<Record<string, readonly string[]>> = solidScriptSystemGroups({
  Face: ['Index', 'Number', 'Center', 'Normal', 'Width', 'Height', 'Area', 'Tag'],
  Vertex: ['Index', 'Position', 'Normal'],
  Edge: ['Index', 'Start', 'End', 'Middle', 'Length', 'Direction'],
  Point: ['Index', 'Position', 'Normal'],
});

/**
 * Adds the built-in values every script can read, such as Time.Year, to the
 * loop values.
 *
 * @param loops Loop values by group.
 * @returns Every read-only value by group.
 */
function solidScriptSystemGroups(loops: Record<string, string[]>): Record<string, string[]> {
  for (const { name } of SOLID_SCRIPT_SYSTEM_GLOBALS) {
    const [group = '', member = ''] = name.split('.');
    (loops[group] ??= []).push(member);
  }
  return loops;
}

/** Spellings of the read-only values by their key, as names ignore case. */
const SOLID_SCRIPT_SYSTEM_SPELLINGS: ReadonlyMap<string, string> = new Map(
  Object.entries(SOLID_SCRIPT_SYSTEM_VALUES).flatMap(([group, members]) =>
    members.map((member) => [`${group}.${member}`.toLowerCase(), `${group}.${member}`] as const),
  ),
);

/** A list item or count behind a name, such as points(2) or points().count. */
const SOLID_SCRIPT_NAME_ITEM = /^(.*?)\s*\((.*)\)\s*(?:\.\s*([A-Za-z_]\w*))?$/s;

/** A name of the script, with an optional prefix and vector part. */
const SOLID_SCRIPT_NAME_OWN = /^(local\.|persistent\.)?[A-Za-z_]\w*(\.[xyzXYZ])?$/i;

/** A read-only value of a loop, with an optional vector part. */
const SOLID_SCRIPT_NAME_SYSTEM = /^([A-Za-z]+)\.([A-Za-z0-9]+)(\.[xyzXYZ])?$/;

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
  const item = SOLID_SCRIPT_NAME_ITEM.exec(text);
  const base = item ? item[1]!.trim() : text;
  if (item?.[3] !== undefined && item[3].toLowerCase() !== 'count')
    return `a list has no .${item[3]}; write ${base}().count for the number of items`;
  if (!base.includes('.') || SOLID_SCRIPT_NAME_OWN.test(base)) return '';
  const system = SOLID_SCRIPT_NAME_SYSTEM.exec(base);
  const spelled = system ? SOLID_SCRIPT_SYSTEM_SPELLINGS.get(`${system[1]}.${system[2]}`.toLowerCase()) : undefined;
  if (spelled) return use === 'set' ? `${spelled} is a built-in value and can only be read` : '';
  return `"${base}" cannot be a name: names use letters, digits and _. A dot only works in built-in names, such as pos.x, local.width, persistent.count or Face.Center`;
}
