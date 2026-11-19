import type { SolidScriptSelectedKind } from './solid_script_machine_variables.js';
import { SolidScriptElement, type SolidScriptValue } from './solid_script_value.js';

/**
 * Which word that picks the items between this Select and the previous Select
 * of the same kind.
 */
export const SOLID_SCRIPT_SELECT_BETWEEN = 'Between';

/** What an empty Of is missing, for the stop text and the one-click fix. */
export type SolidScriptSelectMissing = 'brushes' | 'faces' | 'edges' | 'vertices';

/** Official Select line that fills each [$Selected.*] list. */
const SOLID_SCRIPT_SELECT_LINE: Readonly<Record<SolidScriptSelectMissing, string>> = {
  brushes: 'Select Brushes',
  faces: 'Select Faces',
  edges: 'Select Edges',
  vertices: 'Select Vertices',
};

/** Command id of that Select line. */
const SOLID_SCRIPT_SELECT_COMMAND: Readonly<Record<SolidScriptSelectMissing, string>> = {
  brushes: 'select_brushes',
  faces: 'select_faces',
  edges: 'select_edges',
  vertices: 'select_vertices',
};

/** Example Of value for each kind. */
const SOLID_SCRIPT_SELECT_EXAMPLE: Readonly<Record<SolidScriptSelectMissing, string>> = {
  brushes: '[Wall]',
  faces: '[Face]',
  edges: '[Edge]',
  vertices: '[Vertex]',
};

/**
 * The stop text when a tool's Of is empty and nothing is picked yet.
 *
 * @param label Command name, such as Clip or Extrude Face.
 * @param missing What Of was going to use.
 * @returns Two sentences naming the fix.
 */
export function solidScriptOfEmpty(label: string, missing: SolidScriptSelectMissing): string {
  const select = SOLID_SCRIPT_SELECT_LINE[missing];
  const item = missing === 'brushes' ? 'brush' : missing.slice(0, -1);
  return (
    `${label} doesn't know which ${missing} to work on yet. ` +
    `Add a ${select} line above it to pick them, or write a ${item} in Of, like ${SOLID_SCRIPT_SELECT_EXAMPLE[missing]}.`
  );
}

/**
 * The one-click fix for an empty-Of stop, when the message is one of those
 * sentences.
 *
 * @param message Error text.
 * @returns The Select command to insert, or null when the message is another
 *   kind of stop.
 */
export function solidScriptSelectFix(message: string): { command: string; label: string } | null {
  const found = (Object.keys(SOLID_SCRIPT_SELECT_LINE) as SolidScriptSelectMissing[]).find((missing) =>
    message.includes(`Add a ${SOLID_SCRIPT_SELECT_LINE[missing]} line above it`),
  );
  if (!found) return null;
  const label = SOLID_SCRIPT_SELECT_LINE[found];
  return { command: SOLID_SCRIPT_SELECT_COMMAND[found], label };
}

/**
 * Items that have appeared since the last Select of this kind; all of them when
 * this is the first such Select.
 *
 * @param seen Ids from the last Select, or undefined when there was none.
 * @param items Current items.
 * @returns New items, in the same order.
 */
export function solidScriptSelectFresh(
  seen: ReadonlySet<number> | undefined,
  items: readonly SolidScriptValue[],
): SolidScriptValue[] {
  if (!seen) return [...items];
  return items.filter((item) => item instanceof SolidScriptElement && !seen.has(item.id));
}

/**
 * Ids of the items a Select just looked at, for the next Select Which Between.
 *
 * @param items Items in the pool.
 * @returns Ids.
 */
export function solidScriptSelectIds(items: readonly SolidScriptValue[]): Set<number> {
  const ids = new Set<number>();
  for (const item of items) if (item instanceof SolidScriptElement) ids.add(item.id);
  return ids;
}

/**
 * The button caption that inserts the missing Select line.
 *
 * @param label Official Select name, such as Select Brushes.
 * @returns Caption.
 */
export function solidScriptSelectFixLabel(label: string): string {
  return `Add ${label} Above`;
}

export type { SolidScriptSelectedKind };
