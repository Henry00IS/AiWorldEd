import type { SolidScriptValue } from './solid_script_value.js';

/**
 * Value written to Into for a building line: always a list when the line can
 * create several items, even if it built only one this time; otherwise a single
 * item when there is exactly one.
 *
 * @param listed True when Into is a list kind.
 * @param items Built brushes or meshes.
 * @returns Variable value.
 */
export function solidScriptIntoAssigned(listed: boolean, items: readonly SolidScriptValue[]): SolidScriptValue {
  const [only] = items;
  if (!listed && items.length === 1 && only !== undefined) return only;
  return [...items];
}
