/**
 * System names as scripts write them: $ then PascalCase, such as $NZ or
 * $Selected.Faces. Command fills and the built-in values every script can read
 * are declared here or checked against this pattern, so a new name cannot skip
 * the $.
 */

import { SOLID_SCRIPT_NAME_SCOPES, solidScriptNameKey, type SolidScriptNameScope } from './solid_script_name_key.js';
import {
  SOLID_SCRIPT_SYSTEM_GLOBALS,
  SOLID_SCRIPT_SYSTEM_LISTED,
  SOLID_SCRIPT_SYSTEM_SELECTED,
  type SolidScriptSystemValue,
} from './solid_script_system.js';

/** A system name as scripts write it, such as $NZ or $Selected.Faces. */
export type SolidScriptSystemName = `$${string}`;

/**
 * One value a command fills in for its own fields, such as $NZ on Extrude
 * Faces.
 */
export interface SolidScriptSystemFill {
  /** Kind, such as Number. */
  type: string;
  /** What it holds, in a few words. */
  detail: string;
}

/**
 * Every name a command may fill in, with its kind and meaning. A command can
 * only fill names listed here.
 */
export const SOLID_SCRIPT_SYSTEM_FILLS = {
  $Object: { type: 'Object', detail: 'the solid a line is testing or working on' },
  $Face: { type: 'Face', detail: 'the face a line is testing or working on' },
  $Edge: { type: 'Edge', detail: 'the edge a line is testing or working on' },
  $Vertex: { type: 'Vertex', detail: 'the corner a line is testing or working on' },
  $FaceCorner: { type: 'FaceCorner', detail: "the face corner, one face's use of a vertex, a line is working on" },
  $Point: { type: 'Point', detail: 'the point a line is testing or working on' },
  $Item: { type: 'Value', detail: 'the item a Filter List condition is testing' },
  $X: { type: 'Number', detail: 'X of the current position or center' },
  $Y: { type: 'Number', detail: 'Y of the current position or center' },
  $Z: { type: 'Number', detail: 'Z of the current position or center' },
  $NX: { type: 'Number', detail: 'short form of $Vertex.Normal.X, or $Face.Normal.X' },
  $NY: { type: 'Number', detail: 'short form of $Vertex.Normal.Y, or $Face.Normal.Y' },
  $NZ: { type: 'Number', detail: 'short form of $Vertex.Normal.Z, or $Face.Normal.Z' },
  $Count: { type: 'Number', detail: 'how many items the line works through' },
  $Index: { type: 'Number', detail: 'the number of this solid, face, edge, vertex, point or list item, from 0' },
  $Id: {
    type: 'Number',
    detail: 'a number that stays with this face, edge, vertex or point, from where it is; else its $Index',
  },
} as const satisfies Record<SolidScriptSystemName, SolidScriptSystemFill>;

/** A name a command may fill in, such as $NZ. */
export type SolidScriptSystemFillName = keyof typeof SOLID_SCRIPT_SYSTEM_FILLS;

/** $ then PascalCase parts, such as $NZ or $Selected.Faces. */
export const SOLID_SCRIPT_SYSTEM_NAME = /^\$[A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*)*$/;

/** Official fill spellings by their key, as names ignore case. */
const SOLID_SCRIPT_SYSTEM_FILL_KEYS: ReadonlyMap<string, SolidScriptSystemFillName> = new Map(
  (Object.keys(SOLID_SCRIPT_SYSTEM_FILLS) as SolidScriptSystemFillName[]).map((name) => [name.toLowerCase(), name]),
);

/**
 * Official listed system names by their key without the $, as names ignore
 * case.
 */
const SOLID_SCRIPT_SYSTEM_LISTED_KEYS: ReadonlyMap<string, string> = new Map(
  SOLID_SCRIPT_SYSTEM_LISTED.map(([name]) => [name.slice(1).toLowerCase(), name]),
);

/**
 * Tells whether a name is written as a system name: $ then PascalCase parts.
 *
 * @param name Name as written.
 * @returns True for a name such as $NZ or $Selected.Faces.
 */
export function solidScriptSystemNameOk(name: string): name is SolidScriptSystemName {
  return SOLID_SCRIPT_SYSTEM_NAME.test(name);
}

/**
 * Finds a declared fill by a name written in any case, such as $nz for $NZ.
 *
 * @param name Name as written, with or without its $.
 * @returns Official name and what it holds, or undefined when it is not a fill.
 */
export function solidScriptSystemFill(
  name: string,
): (SolidScriptSystemFill & { name: SolidScriptSystemFillName }) | undefined {
  const key = (name.startsWith('$') ? name : `$${name}`).toLowerCase();
  const official = SOLID_SCRIPT_SYSTEM_FILL_KEYS.get(key);
  return official ? { name: official, ...SOLID_SCRIPT_SYSTEM_FILLS[official] } : undefined;
}

/**
 * Gives the official $ spelling of a system value written without it.
 *
 * @param written Name as written, such as Math.Pi, Pi or Nz.
 * @returns Official name, or undefined when it is not a system value.
 */
export function solidScriptSystemOfficial(written: string): string | undefined {
  const name = written.trim();
  if (name.startsWith('$') || name === '') return undefined;
  if (solidScriptNameKey(name) === 'pi') return '$Math.Pi';
  return solidScriptSystemFill(name)?.name ?? SOLID_SCRIPT_SYSTEM_LISTED_KEYS.get(name.toLowerCase());
}

/**
 * Explains that a name written without $ is a system value, with the spelling
 * to use.
 *
 * @param written Name as written, such as Math.Pi, Pi or Nz.
 * @returns Message, or undefined when the name is not a system value.
 */
export function solidScriptSystemBareHint(written: string): string | undefined {
  const name = written.trim();
  const official = solidScriptSystemOfficial(name);
  return official ? `${name} is a system value. Did you mean to write ${official}?` : undefined;
}

/** One system value as the variable explorer lists it. */
export interface SolidScriptSystemCatalogEntry {
  /** Name with its $, such as $Selected.Faces. */
  name: SolidScriptSystemName;
  /** Kind, such as Face List. */
  type: string;
  /** What it holds, in a few words. */
  detail: string;
  /** What the explorer shows when the value cannot be read outside a run. */
  absent: string;
  /**
   * True for $Local and $Persistent, which hold the script's own names rather
   * than a value.
   */
  scoped?: true;
}

/** What $Local and $Persistent hold, as the variable explorer lists them. */
const SOLID_SCRIPT_SYSTEM_SCOPES: Record<SolidScriptNameScope, Omit<SolidScriptSystemCatalogEntry, 'name'>> = {
  $Local: {
    type: 'Function Variables',
    detail: 'the variables of the running Function, written $Local.Name',
    absent: 'Only Inside a Function',
    scoped: true,
  },
  $Persistent: {
    type: 'Kept Values',
    detail: 'values kept between runs, written $Persistent.Name',
    absent: 'No Values Yet',
    scoped: true,
  },
};

/**
 * Turns registered system values into catalog entries.
 *
 * @param values Values without their $.
 * @param absent Text shown when a value cannot be read outside a run.
 * @returns Catalog entries.
 */
function solidScriptSystemCatalogFrom(
  values: readonly SolidScriptSystemValue[],
  absent: string,
): SolidScriptSystemCatalogEntry[] {
  return values.map((value) => ({ name: `$${value.name}`, type: value.type, detail: value.detail, absent }));
}

/**
 * Every system name a script can read, from the registries above: the selected
 * lists, the built-in values, the command fills, and $Local and $Persistent.
 * The variable explorer lists exactly these.
 */
export const SOLID_SCRIPT_SYSTEM_CATALOG: readonly SolidScriptSystemCatalogEntry[] = [
  ...solidScriptSystemCatalogFrom(SOLID_SCRIPT_SYSTEM_SELECTED, 'Nothing Ran Yet'),
  ...solidScriptSystemCatalogFrom(SOLID_SCRIPT_SYSTEM_GLOBALS, 'Only with a Box'),
  ...(Object.entries(SOLID_SCRIPT_SYSTEM_FILLS) as [SolidScriptSystemFillName, SolidScriptSystemFill][]).map(
    ([name, fill]) => ({ name, type: fill.type, detail: fill.detail, absent: 'Only Inside Lines That Fill It' }),
  ),
  ...SOLID_SCRIPT_NAME_SCOPES.map((name) => ({ name, ...SOLID_SCRIPT_SYSTEM_SCOPES[name] })),
];
