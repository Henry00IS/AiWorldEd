import { solidScriptValueText, type SolidScriptValue } from './solid_script_value.js';

/**
 * A reference to a list variable or one of its items, as written inside a
 * field's brackets or in Set's variable name:
 *
 * - `points(2)` is item 2 of the list `points`, counting from 0;
 * - `points()` in Set adds an item at the end;
 * - `points().count` is how many items the list has.
 */
export interface SolidScriptListItemReference {
  /** Name of the list variable. */
  name: string;
  /** Index text between the round brackets, possibly empty. */
  index: string;
  /** Lower-case function after the brackets, such as "count", or empty. */
  method: string;
}

/**
 * Shape of an item reference: a name, round brackets, and an optional
 * .function.
 */
const SOLID_SCRIPT_LIST_ITEM = /^\s*([A-Za-z_]\w*)\s*\((.*)\)\s*(?:\.\s*([A-Za-z_]\w*))?\s*$/s;

/** Functions that can follow a list reference. */
const SOLID_SCRIPT_LIST_METHODS = new Set(['count']);

/**
 * Reads an item reference.
 *
 * @param text Text inside the brackets, or a variable name.
 * @returns Reference, or null when the text is a plain name.
 */
export function solidScriptListItemParse(text: string): SolidScriptListItemReference | null {
  const match = SOLID_SCRIPT_LIST_ITEM.exec(text);
  if (!match) return null;
  const method = (match[3] ?? '').toLowerCase();
  if (method && !SOLID_SCRIPT_LIST_METHODS.has(method))
    throw new Error(`a list has no .${method}; use ${match[1]}().count for the number of items`);
  return { name: match[1]!, index: match[2]!.trim(), method };
}

/**
 * Reads an index as a whole number from 0.
 *
 * @param name List name, for messages.
 * @param index Index value.
 * @returns Index.
 */
export function solidScriptListIndex(name: string, index: SolidScriptValue): number {
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0)
    throw new Error(`the item number in ${name}(…) must be a whole number from 0, not ${solidScriptValueText(index)}`);
  return index;
}

/**
 * Reads an item or the count of a list.
 *
 * @param name List name.
 * @param list Value of the list variable.
 * @param index Index, or null for the whole list.
 * @param method Function such as "count", or empty.
 * @returns Value.
 */
export function solidScriptListItemRead(
  name: string,
  list: SolidScriptValue,
  index: SolidScriptValue | null,
  method: string,
): SolidScriptValue {
  if (!Array.isArray(list))
    throw new Error(`[${name}] is ${solidScriptValueText(list)}, not a list; set ${name}() to add items to a list`);
  if (method === 'count') {
    if (index !== null) throw new Error(`write ${name}().count for the number of items, with nothing in the brackets`);
    return list.length;
  }
  if (index === null) throw new Error(`write an item number in ${name}(…), such as ${name}(0) for the first item`);
  const at = solidScriptListIndex(name, index);
  if (at >= list.length)
    throw new Error(
      list.length === 0
        ? `${name}(${at}) does not exist: ${name} has no items yet`
        : `${name}(${at}) does not exist: ${name} has ${list.length} items, numbered 0 to ${list.length - 1}`,
    );
  return list[at];
}

/**
 * Returns a list with one item set or added.
 *
 * @param name List name.
 * @param list Current value, or undefined for a new list.
 * @param index Index to set, or null to add at the end.
 * @param value New item.
 * @returns New list.
 */
export function solidScriptListItemWrite(
  name: string,
  list: SolidScriptValue,
  index: SolidScriptValue | null,
  value: SolidScriptValue,
): SolidScriptValue[] {
  const items = list === undefined ? [] : list;
  if (!Array.isArray(items))
    throw new Error(`[${name}] is ${solidScriptValueText(items)}, not a list, so it has no items to set`);
  const at = index === null ? items.length : solidScriptListIndex(name, index);
  if (at > items.length)
    throw new Error(
      `${name}(${at}) is past the end: ${name} has ${items.length} items, so the next one is ${name}(${items.length})`,
    );
  const next = [...items];
  next[at] = value;
  return next;
}

/**
 * Takes one item out of a list for Remove Item; the items after it move up.
 *
 * @param name List name, for messages.
 * @param list Current value.
 * @param index Item to remove, or null for the last item.
 * @returns New list.
 */
export function solidScriptListItemRemove(
  name: string,
  list: SolidScriptValue,
  index: SolidScriptValue | null,
): SolidScriptValue[] {
  if (!Array.isArray(list))
    throw new Error(`[${name}] is ${solidScriptValueText(list)}, not a list, so it has no items to remove`);
  if (list.length === 0) throw new Error(`${name} has no items to remove`);
  const at = index === null ? list.length - 1 : solidScriptListIndex(name, index);
  if (at >= list.length)
    throw new Error(`${name}(${at}) is past the end: ${name} has ${list.length} items, numbered from 0`);
  return list.filter((_, position) => position !== at);
}
