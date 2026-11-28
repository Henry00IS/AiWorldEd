import { solidScriptNameIsSystem } from './solid_script_name_key.js';
import { SOLID_SCRIPT_SYSTEM_GLOBALS, SOLID_SCRIPT_SYSTEM_SELECTED } from './solid_script_system.js';

/**
 * Which names may contain a dot. A script's own names use letters, digits and _
 * only; a dot reads a member, such as Face.Center, Faces.Count, Pos.X or
 * Face.Data.Height, and $Local. and $Persistent. go in front of a name. System
 * values start with $, such as $Selected.Faces or $Box.Width.
 */

/** System values by group, without the $, such as Box: Width. */
export const SOLID_SCRIPT_SYSTEM_VALUES: Readonly<Record<string, readonly string[]>> = solidScriptSystemGroups();

/**
 * Groups the selected lists and the built-in values every script can read, such
 * as Selected: Faces and Time: Year.
 *
 * @returns Every system value by group.
 */
function solidScriptSystemGroups(): Record<string, string[]> {
  const lists: Record<string, string[]> = {};
  for (const { name } of [...SOLID_SCRIPT_SYSTEM_SELECTED, ...SOLID_SCRIPT_SYSTEM_GLOBALS]) {
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
const SOLID_SCRIPT_NAME_OWN = /^(\$local\.|\$persistent\.)?[A-Za-z_]\w*\s*(\(.*\))?(\.[xyzXYZ])?$/is;

/**
 * Splits a name at its dots outside brackets.
 *
 * @param name Name.
 * @returns Parts.
 */
export function solidScriptNameParts(name: string): string[] {
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
  if (solidScriptNameIsSystem(text)) return '';
  const parts = solidScriptNameParts(text);
  const last = parts.length - 1;
  const bad = parts.find(
    (part, index) =>
      !SOLID_SCRIPT_NAME_PART.test(index === 0 ? part.replace(/^\$/, '') : part) &&
      !(index === last && /^\[.*\]$/s.test(part)),
  );
  if (bad !== undefined)
    return `"${text}" cannot be a name: names use letters, digits and _, and a dot reads a member such as Face.Center, Pos.X or Face.Data.Height`;
  if (
    use === 'read' ||
    SOLID_SCRIPT_NAME_OWN.test(text) ||
    solidScriptNameIsDataWrite(text) ||
    solidScriptNameIsUvWrite(text) ||
    solidScriptNameIsPositionWrite(text) ||
    solidScriptNameIsModeWrite(text)
  )
    return '';
  if (parts.length >= 2 && parts[last]?.toLowerCase() === 'data')
    return `${text} needs a key to set, such as ${text}.Height; a line sets a value under .Data, not .Data itself`;
  return `${text} can only be read; a line sets whole names, .X, .Y and .Z of a vector, Vertex.Position, Face.UVs, FaceCorner.UV, Solid.Mode, or a value under .Data such as Face.Data.Height or Solid.Edges.Data.Kind`;
}

/** Members a line may set on every item of a list, or on one with Member(2). */
export type SolidScriptMemberKind = 'data' | 'position' | 'mode' | 'uvs' | 'uv';

/** A Set name that writes a member of an element, read once. */
export interface SolidScriptMemberWrite {
  /** Which member it writes. */
  kind: SolidScriptMemberKind;
  /** Name of the element or list that owns the members, as written. */
  owner: string;
  /** The name up to the member, without its item number, for messages. */
  shown: string;
  /** Item number text of Member(2), or null for every item. */
  item: string | null;
  /** Key under .Data, as written; empty for the other members. */
  key: string;
  /** Axis of a trailing .X, .Y or .Z on a position, if any. */
  axis?: 'x' | 'y' | 'z';
}

/** Member names that are not Data, by the kind they write. */
const SOLID_SCRIPT_MEMBER_KINDS: Readonly<Record<string, SolidScriptMemberKind>> = {
  position: 'position',
  positions: 'position',
  mode: 'mode',
  modes: 'mode',
  uvs: 'uvs',
  uv: 'uv',
};

/** The last part of a name: a member or key with an optional item number. */
const SOLID_SCRIPT_MEMBER_END = /^([A-Za-z_]\w*)\s*(?:\((.*)\))?$/s;

/** Member writes already read, by name as written. */
const SOLID_SCRIPT_MEMBER_WRITES = new Map<string, SolidScriptMemberWrite | null>();

/**
 * Reads a name a line sets as a member of an element or of each element of a
 * list: Face.Data.Height, Faces.UVs, FaceCorner.UV, Vertices.Positions,
 * Vertex.Position.Y or Objects.Modes, each with an optional item number on the
 * member, such as Vertices.Positions(2), to set one item only. Every member
 * reads its item number the same way: it counts the items the name reads as.
 *
 * @param name Name as written.
 * @returns The write, or null when the name is not such a member.
 */
export function solidScriptMemberWriteParse(name: string): SolidScriptMemberWrite | null {
  const known = SOLID_SCRIPT_MEMBER_WRITES.get(name);
  if (known !== undefined) return known;
  if (SOLID_SCRIPT_MEMBER_WRITES.size >= 4096) SOLID_SCRIPT_MEMBER_WRITES.clear();
  const found = solidScriptMemberWriteFind(name);
  SOLID_SCRIPT_MEMBER_WRITES.set(name, found);
  return found;
}

/**
 * Reads a member write without the kept answers.
 *
 * @param name Name as written.
 * @returns The write, or null.
 */
function solidScriptMemberWriteFind(name: string): SolidScriptMemberWrite | null {
  const text = name.trim();
  if (!text.includes('.')) return null;
  const parts = solidScriptNameParts(text);
  if (parts.length >= 3 && parts[parts.length - 2]?.toLowerCase() === 'data') return solidScriptMemberDataFind(parts);
  const axis = solidScriptMemberAxis(parts);
  if (axis) parts.pop();
  const end = SOLID_SCRIPT_MEMBER_END.exec(parts[parts.length - 1] ?? '');
  const kind = SOLID_SCRIPT_MEMBER_KINDS[end?.[1]?.toLowerCase() ?? ''];
  if (!end || !kind || parts.length < 2) return null;
  if (kind === 'mode' && solidScriptNameIsSystem(text) && parts[0]?.replace(/^\$/, '').toLowerCase() !== 'selected')
    return null;
  const owner = parts.slice(0, -1).join('.');
  return { kind, owner, shown: `${owner}.${end[1]}`, item: end[2] ?? null, key: '', ...(axis ? { axis } : {}) };
}

/**
 * Reads a name that ends in .Data.Key, maybe with an item number on the key.
 *
 * @param parts Parts of the name, at least three.
 * @returns The write.
 */
function solidScriptMemberDataFind(parts: readonly string[]): SolidScriptMemberWrite {
  const last = parts[parts.length - 1] ?? '';
  const end = SOLID_SCRIPT_MEMBER_END.exec(last);
  const key = end?.[1] ?? last;
  const owner = parts.slice(0, -2).join('.');
  return { kind: 'data', owner, shown: `${owner}.${parts[parts.length - 2]}.${key}`, item: end?.[2] ?? null, key };
}

/**
 * Reads the axis a position name ends in, such as the Y of Positions(0).Y.
 *
 * @param parts Parts of the name.
 * @returns Axis, or undefined when the name does not end in one on a position.
 */
function solidScriptMemberAxis(parts: readonly string[]): 'x' | 'y' | 'z' | undefined {
  const last = parts[parts.length - 1]?.toLowerCase() ?? '';
  const before = SOLID_SCRIPT_MEMBER_END.exec(parts[parts.length - 2] ?? '')?.[1]?.toLowerCase() ?? '';
  const axis = /^[xyz]$/.test(last) && parts.length >= 3 && SOLID_SCRIPT_MEMBER_KINDS[before] === 'position';
  return axis ? (last as 'x' | 'y' | 'z') : undefined;
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
  return solidScriptMemberWriteParse(name)?.kind === 'data';
}

/**
 * Tells whether a name sets Face.UVs, a list of faces' UVs, or the UV of a face
 * corner, such as Face.UVs, Sides.UVs or FaceCorner.UV.
 *
 * @param name Name as written, without brackets.
 * @returns True for such a name.
 */
export function solidScriptNameIsUvWrite(name: string): boolean {
  const kind = solidScriptMemberWriteParse(name)?.kind;
  return kind === 'uvs' || kind === 'uv';
}

/**
 * Tells whether a name sets the UV of a face corner or of each face corner in a
 * list, such as FaceCorner.UV or Corners.UV.
 *
 * @param name Name as written, without brackets.
 * @returns True for such a name.
 */
export function solidScriptNameIsFaceCornerUvWrite(name: string): boolean {
  return solidScriptMemberWriteParse(name)?.kind === 'uv';
}

/**
 * Tells whether a name sets a corner position, such as Vertex.Position,
 * Vertices.Positions, Vertex.Position.Y or [$Selected.Vertices.Positions(0)].
 *
 * @param name Name as written, without brackets.
 * @returns True for such a name.
 */
export function solidScriptNameIsPositionWrite(name: string): boolean {
  return solidScriptMemberWriteParse(name)?.kind === 'position';
}

/**
 * Tells whether a name sets a brush Mode, such as Brush.Mode, Brushes.Modes or
 * [$Selected.Objects.Modes].
 *
 * @param name Name as written, without brackets.
 * @returns True for such a name.
 */
export function solidScriptNameIsModeWrite(name: string): boolean {
  return solidScriptMemberWriteParse(name)?.kind === 'mode';
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
