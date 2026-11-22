import type { SolidScriptElements } from './solid_script_elements.js';
import { solidScriptMemberRead } from './solid_script_members.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import { SolidScriptElement, solidScriptValueNumbers, type SolidScriptValue } from './solid_script_value.js';

/**
 * Lists, for each item, the other items it touches: faces sharing an edge, or
 * edges and corners sharing a corner.
 *
 * @param items Faces, edges or corners.
 * @param elements Geometry values of the run.
 * @returns Neighbors per item, among the items only.
 */
export function solidScriptDataBlurNeighbors(
  items: readonly SolidScriptElement[],
  elements: SolidScriptElements,
): SolidScriptElement[][] {
  const known = new Set(items);
  const own = items.map((item) => (item.kind === 'face' ? [] : solidScriptDataBlurKeys(item, elements)));
  return items.map((item, index) => {
    if (item.kind === 'face') {
      const touching = solidScriptMemberRead(item, 'neighbors', elements);
      return Array.isArray(touching)
        ? touching.filter(
            (other): other is SolidScriptElement => other instanceof SolidScriptElement && known.has(other),
          )
        : [];
    }
    const reach = new Set(item.kind === 'vertex' ? solidScriptDataBlurReach(item, elements) : own[index]);
    return items.filter((other, at) => other !== item && (own[at] ?? []).some((key) => reach.has(key)));
  });
}

/**
 * Position keys of an edge (its two ends) or a corner (itself).
 *
 * @param item Edge or corner.
 * @param elements Geometry values of the run.
 * @returns Rounded position keys.
 */
function solidScriptDataBlurKeys(item: SolidScriptElement, elements: SolidScriptElements): string[] {
  const members = item.kind === 'edge' ? ['start', 'end'] : ['position'];
  return members.map((member) => solidScriptDataBlurKey(solidScriptMemberRead(item, member, elements)));
}

/**
 * Position keys of the far ends of a corner's edges.
 *
 * @param vertex Corner.
 * @param elements Geometry values of the run.
 * @returns Rounded position keys.
 */
function solidScriptDataBlurReach(vertex: SolidScriptElement, elements: SolidScriptElements): string[] {
  const edges = solidScriptMemberRead(vertex, 'edges', elements);
  return (Array.isArray(edges) ? edges : []).flatMap((edge) =>
    ['start', 'end'].map((member) => solidScriptDataBlurKey(solidScriptMemberRead(edge, member, elements))),
  );
}

/**
 * Rounds a position into a key, so equal corners match.
 *
 * @param position Position value.
 * @returns Key.
 */
function solidScriptDataBlurKey(position: SolidScriptValue): string {
  return (solidScriptValueNumbers(position) ?? []).map((value) => value.toFixed(4)).join(',');
}

/**
 * Averages a .Data number or vector of each item with those of its neighbors,
 * Rounds times; every round reads the values of the round before. Items whose
 * key holds no number are left as they are and not counted.
 *
 * @param items Faces, edges or corners.
 * @param key Data key as written.
 * @param rounds How many times to average.
 * @param elements Geometry values of the run.
 */
export function solidScriptDataBlur(
  items: readonly SolidScriptElement[],
  key: string,
  rounds: number,
  elements: SolidScriptElements,
): void {
  const folded = solidScriptNameKey(key);
  const place = new Map(items.map((item, at) => [item, at]));
  const neighbors = solidScriptDataBlurNeighbors(items, elements).map((list) =>
    list.flatMap((other) => place.get(other) ?? []),
  );
  let values = items.map((item) => solidScriptDataBlurNumbers(elements.dataRead(item, folded)));
  for (let round = 0; round < rounds; round++)
    values = values.map((own, index) => (own ? solidScriptDataBlurAverage(own, values, neighbors[index] ?? []) : own));
  items.forEach((item, index) => {
    const blurred = values[index];
    if (blurred) elements.dataWrite(elements.data(item), folded, key, solidScriptDataBlurValue(blurred));
  });
}

/**
 * Averages one item's numbers with those of its neighbors that hold the same
 * number of values.
 *
 * @param own The item's numbers.
 * @param values Numbers of every item, from the round before.
 * @param neighbors Places of the item's neighbors.
 * @returns Averaged numbers.
 */
function solidScriptDataBlurAverage(
  own: readonly number[],
  values: readonly (number[] | undefined)[],
  neighbors: readonly number[],
): number[] {
  const others = neighbors.flatMap((other) => {
    const numbers = values[other];
    return numbers && numbers.length === own.length ? [numbers] : [];
  });
  return own.map(
    (value, axis) => others.reduce((sum, numbers) => sum + (numbers[axis] ?? 0), value) / (others.length + 1),
  );
}

/**
 * Turns averaged numbers back into a value: one number stays a number.
 *
 * @param numbers Averaged numbers.
 * @returns Number or list of numbers.
 */
function solidScriptDataBlurValue(numbers: readonly number[]): SolidScriptValue {
  return numbers.length === 1 ? (numbers[0] ?? 0) : [...numbers];
}

/**
 * Reads a .Data value as numbers: one number, or a vector or list of them.
 *
 * @param value Data value.
 * @returns Numbers, or undefined when it holds no number.
 */
function solidScriptDataBlurNumbers(value: SolidScriptValue): number[] | undefined {
  return typeof value === 'number' ? [value] : solidScriptValueNumbers(value);
}
