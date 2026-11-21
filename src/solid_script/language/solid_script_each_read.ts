import { solidScriptEachUsed } from './solid_script_each_uses.js';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import type { SolidScriptValue } from './solid_script_value.js';

/**
 * Reads a field that may change per item: worked out for each item when its
 * text reads a per-item value such as [$Index], else once for all of them. An
 * empty field gives undefined.
 *
 * @param run Running line.
 * @param key Field key.
 * @param count How many items the line works through.
 * @param fills Per-item values of the item at a position, such as $Face, $Index
 *   and $Count.
 * @returns The value for the item at a position, from 0.
 */
export function solidScriptEachRead(
  run: SolidScriptBlockRun,
  key: string,
  count: number,
  fills: (index: number) => Readonly<Record<string, SolidScriptValue>>,
): (index: number) => SolidScriptValue {
  const source = run.source(key);
  if (source.trim() === '') return () => undefined;
  if (!solidScriptEachUsed(source)) {
    const once = run.value(key);
    return () => once;
  }
  const read = new Map<number, SolidScriptValue>();
  return (index) => {
    if (index < 0 || index >= count) throw new Error(`no item ${index} of ${count}`);
    if (!read.has(index)) read.set(index, run.valueWith(key, fills(index)));
    return read.get(index);
  };
}
