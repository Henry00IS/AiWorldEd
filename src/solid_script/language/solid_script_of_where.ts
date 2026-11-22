import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import { solidScriptConditionHolds } from './solid_script_condition.js';
import { SolidScriptElement, type SolidScriptElementKind, type SolidScriptValue } from './solid_script_value.js';

/** Name an item of each kind is tested as in a Where, besides [$Item]. */
const SOLID_SCRIPT_OF_WHERE_FILLS: Readonly<Partial<Record<SolidScriptElementKind, string>>> = {
  brush: '$Object',
  face: '$Face',
  edge: '$Edge',
  vertex: '$Vertex',
  point: '$Point',
};

/**
 * What a Where reads for one item: the item as [$Item] and by its kind, such as
 * [$Face], its number and how many items there are.
 *
 * @param item Item.
 * @param index Number of the item from 0.
 * @param count How many items there are.
 * @returns Fills.
 */
function solidScriptOfWhereFills(
  item: SolidScriptValue,
  index: number,
  count: number,
): Record<string, SolidScriptValue> {
  const named = item instanceof SolidScriptElement ? SOLID_SCRIPT_OF_WHERE_FILLS[item.kind] : undefined;
  return { ...(named ? { [named]: item } : {}), $Item: item, $Index: index, $Count: count };
}

/**
 * Keeps the items a line works on that pass its Where; a line without a Where,
 * or with an empty one, keeps them all.
 *
 * @param run Running line.
 * @param items Items from Of, or the selection an empty Of uses.
 * @returns Items that pass.
 */
export function solidScriptOfWhere(run: SolidScriptBlockRun, items: readonly SolidScriptValue[]): SolidScriptValue[] {
  if (run.source('where').trim() === '') return [...items];
  return items.filter((item, index) =>
    solidScriptConditionHolds(run, 'where', solidScriptOfWhereFills(item, index, items.length)),
  );
}
