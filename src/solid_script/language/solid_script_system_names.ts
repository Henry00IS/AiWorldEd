/**
 * System names as scripts write them: $ then PascalCase, such as $NZ or
 * $Selected.Faces. Command fills and the built-in values every script can read
 * are declared here or checked against this pattern, so a new name cannot skip
 * the $.
 */

import { solidScriptNameKey } from './solid_script_name_key.js';
import { SOLID_SCRIPT_SYSTEM_LISTED } from './solid_script_system.js';

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
  $X: { type: 'Number', detail: 'where the point is, on X' },
  $Y: { type: 'Number', detail: 'where the point is, on Y' },
  $Z: { type: 'Number', detail: 'where the point is, on Z' },
  $NX: { type: 'Number', detail: 'which way the surface faces, on X' },
  $NY: { type: 'Number', detail: 'which way the surface faces, on Y' },
  $NZ: { type: 'Number', detail: 'which way the surface faces, on Z' },
  $CX: { type: 'Number', detail: 'the middle of the face, on X' },
  $CY: { type: 'Number', detail: 'the middle of the face, on Y' },
  $CZ: { type: 'Number', detail: 'the middle of the face, on Z' },
  $Index: { type: 'Number', detail: 'the number of this point or face, from 0' },
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
