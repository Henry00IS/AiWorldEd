import { solidScriptParameterEach } from './solid_script_command_each.js';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterOptional,
  solidScriptParameterWrites,
} from './solid_script_command_parameters.js';
import { solidScriptConditionHolds } from '@/solid_script/language/solid_script_condition.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import {
  solidScriptValueEquals,
  solidScriptValueNumber,
  solidScriptValueText,
  type SolidScriptValue,
} from '@/solid_script/language/solid_script_value.js';

/** Name field of a list. */
const SOLID_SCRIPT_LIST_FIELD = solidScriptParameter(
  'list',
  'List',
  'name',
  'Items',
  'Name of the list, without brackets, such as Items.',
);

/** Name field of the list a line adds to: a name not set yet becomes a list. */
const SOLID_SCRIPT_LIST_ADD = solidScriptParameterWrites(SOLID_SCRIPT_LIST_FIELD, { rule: 'list', what: 'list' });

/** Name field of the list a line changes, which stays a list. */
const SOLID_SCRIPT_LIST_NAME = solidScriptParameterWrites(SOLID_SCRIPT_LIST_FIELD, { rule: 'kept' });

/** Name field of the list a line only reads. */
const SOLID_SCRIPT_LIST_READ = solidScriptParameterWrites(SOLID_SCRIPT_LIST_FIELD, { rule: 'read' });

/** Name field of a variable or list. */
const SOLID_SCRIPT_LIST_VARIABLE_FIELD = solidScriptParameter(
  'name',
  'Variable',
  'name',
  'Items',
  'Name of the variable or list, without brackets, such as Items.',
);

/** Stop shared by lines that need an existing list. */
const SOLID_SCRIPT_LIST_STOP = 'A name that is not a list, or no list of that name yet.';

/**
 * Reads the position field of a list line.
 *
 * @param run Running line.
 * @param items List.
 * @param end Whether the position may be one past the last item.
 * @returns Position from 0.
 */
function solidScriptListPosition(run: SolidScriptBlockRun, items: readonly SolidScriptValue[], end: boolean): number {
  const number = solidScriptValueNumber(run.value('at'));
  const last = end ? items.length : items.length - 1;
  if (number === undefined || !Number.isInteger(number) || number < 0 || number > last)
    throw new Error(
      `Position needs a whole number from 0 to ${last}, because the list has ${items.length} items, not ${solidScriptValueText(run.value('at'))}`,
    );
  return number;
}

/**
 * Orders two values: numbers by size, anything else alphabetically, numbers
 * before text.
 *
 * @param a First value.
 * @param b Second value.
 * @returns Below 0 when a comes first.
 */
function solidScriptListCompare(a: SolidScriptValue, b: SolidScriptValue): number {
  const x = solidScriptValueNumber(a);
  const y = solidScriptValueNumber(b);
  if (x !== undefined && y !== undefined) return x - y;
  if (x !== undefined) return -1;
  if (y !== undefined) return 1;
  return solidScriptValueText(a).localeCompare(solidScriptValueText(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/**
 * Puts items in order, by their own value or by what By works out for each one;
 * items with the same key keep their order.
 *
 * @param run Running line.
 * @param items Items of the list.
 * @param sign 1 for smallest first, -1 for biggest first.
 * @returns Sorted items.
 */
function solidScriptListSorted(
  run: SolidScriptBlockRun,
  items: readonly SolidScriptValue[],
  sign: number,
): SolidScriptValue[] {
  if (run.source('by').trim() === '') return [...items].sort((a, b) => sign * solidScriptListCompare(a, b));
  const keyed = items.map((item, index) => ({
    item,
    key: run.valueWith('by', { $Item: item, $Index: index, $Count: items.length }),
  }));
  return keyed.sort((a, b) => sign * solidScriptListCompare(a.key, b.key)).map((entry) => entry.item);
}

/** Commands that change lists and forget or empty variables. */
export const SOLID_SCRIPT_COMMANDS_LISTS: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'add_item',
    label: 'Add Item',
    category: 'Lists',
    description: 'Put a value at the end of a list',
    manual:
      'Puts a value at the end of a list. A list that does not exist yet is made. Example: Add Item 3 to Heights, then Add Item 5 to Heights, and Heights holds 3, 5.',
    stops: [
      'A name that is set but is not a list.',
      'A value that does not fit the Type declared for the list, such as 78o for a Number List.',
    ],
    parameters: [
      solidScriptParameter('value', 'Value', 'value', '1', 'What to put in the list, such as 4 or [Item].'),
      SOLID_SCRIPT_LIST_ADD,
    ],
    listing: (read) => ['Add Item', read.value('value'), ' To ', read.value('list')],
    execute: (run) => {
      const value = run.value('value');
      run.listUpdate(run.text('list'), (items) => [...items, value], true);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'insert_item',
    label: 'Insert Item',
    category: 'Lists',
    description: 'Put a value at a position in a list',
    manual:
      'Puts a value into a list at a position; the items from there on move one place up. Positions count from 0, so 0 is the front. Example: Heights holds 3, 5. Insert Item 4 into Heights at 1 leaves 3, 4, 5.',
    stops: [
      SOLID_SCRIPT_LIST_STOP,
      'A position below 0 or past the end of the list.',
      'A value that does not fit the Type declared for the list.',
    ],
    parameters: [
      solidScriptParameter('value', 'Value', 'value', '1', 'What to put in the list, such as 4 or [Item].'),
      SOLID_SCRIPT_LIST_ADD,
      solidScriptParameter(
        'at',
        'Position',
        'count',
        '0',
        'Where to put it, counting from 0, such as 0 to insert at the start.',
      ),
    ],
    listing: (read) => ['Insert Item', read.value('value'), ' Into ', read.value('list'), ' At ', read.value('at')],
    execute: (run) => {
      const value = run.value('value');
      run.listUpdate(
        run.text('list'),
        (items) => {
          const at = solidScriptListPosition(run, items, true);
          return [...items.slice(0, at), value, ...items.slice(at)];
        },
        false,
      );
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'remove_item',
    label: 'Remove Item',
    category: 'Lists',
    description: 'Take an item out of a list',
    manual:
      'Takes one item out of a list. Points(2) removes item 2, and the items after it move up. Points() removes the last item. Items count from 0. Example: Points holds a, b, c. Remove Item Points(0) leaves b, c.',
    stops: [
      'A variable that is not a list, an empty list, or an item past the end.',
      'An input. Inputs can only be read.',
    ],
    parameters: [
      solidScriptParameterWrites(
        solidScriptParameter(
          'target',
          'Item',
          'target',
          'Points()',
          'List item to remove, such as Points(2), or Points() for the last.',
        ),
        { rule: 'shrunk' },
      ),
    ],
    listing: (read) => ['Remove Item', read.value('target')],
    execute: (run) => {
      run.itemRemove(run.text('target'));
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'remove_value',
    label: 'Remove Value',
    category: 'Lists',
    description: 'Take a value out of a list',
    manual:
      'Takes a value out of a list wherever it is. It removes the first copy, or every copy with Every Copy switched on. A value that is not in the list changes nothing. Example: Colors holds red, blue, red. Remove Value red from Colors leaves blue, red.',
    stops: [SOLID_SCRIPT_LIST_STOP],
    parameters: [
      solidScriptParameter('value', 'Value', 'value', '1', 'What to take out, such as 4 or [Item].'),
      solidScriptParameterWrites(SOLID_SCRIPT_LIST_FIELD, { rule: 'shrunk' }),
      solidScriptParameter(
        'every',
        'Every Copy',
        'boolean',
        'No',
        'Take out every copy, not just the first. Type Yes or No, such as Yes.',
      ),
    ],
    listing: (read) => [
      'Remove Value',
      read.value('value'),
      ' From ',
      read.value('list'),
      ...solidScriptListingOptions([read.on('every') && ['Every Copy']]),
    ],
    execute: (run) => {
      const value = run.value('value');
      const every = run.fields().flag('every');
      run.listUpdate(
        run.text('list'),
        (items) => {
          if (every) return items.filter((item) => !solidScriptValueEquals(item, value));
          const at = items.findIndex((item) => solidScriptValueEquals(item, value));
          return at < 0 ? [...items] : [...items.slice(0, at), ...items.slice(at + 1)];
        },
        false,
      );
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'find_item',
    label: 'Find Item',
    category: 'Lists',
    description: 'Find where a value is in a list',
    manual:
      'Looks for a value in a list and stores its position, counting from 0, in the Result variable. When the value is not there, Result is -1. Example: Colors holds red, blue. Find Item blue in Colors, result in Where, sets Where to 1.',
    stops: [SOLID_SCRIPT_LIST_STOP],
    parameters: [
      solidScriptParameter('value', 'Value', 'value', '1', 'What to look for, such as 4 or [Item].'),
      SOLID_SCRIPT_LIST_READ,
      solidScriptParameterWrites(
        solidScriptParameter(
          'result',
          'Result In',
          'name',
          'Found',
          'Variable that gets the position, or -1, such as At.',
        ),
        { rule: 'kind', kind: 'Number', what: 'position in {list}' },
      ),
    ],
    listing: (read) => [
      'Find Item',
      read.value('value'),
      ' In ',
      read.value('list'),
      ', Result In ',
      read.value('result'),
    ],
    execute: (run) => {
      const value = run.value('value');
      const items = run.listRead(run.text('list'));
      run.variableSet(
        run.text('result'),
        items.findIndex((item) => solidScriptValueEquals(item, value)),
      );
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'filter_list',
    label: 'Filter List',
    category: 'Lists',
    description: 'Keep the items of a list that pass a condition',
    manual:
      'Keeps the items of a list that pass a 🔁 Where condition, and writes them to Into. List can be numbers separated by commas, a list variable such as [Heights], or geometry such as [$Selected.Faces]. Where tests each item as [$Item], with [$Index] its number from 0, and may use Facing, InBox, Near, EveryNth and HasTag. Left off, Where keeps every item. Example: Set [Heights] to 1, 5, 2, then Filter List [Heights] Where [=[$Item] > 2] Into [Tall], and Tall holds 5.',
    stops: ['A List that is not items or a list.'],
    parameters: [
      solidScriptParameter(
        'list',
        'List',
        'value',
        '1, 2, 3',
        'Items separated by commas, or a list such as [Heights] or [$Selected.Faces].',
      ),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'where',
          'Where',
          'value',
          'A condition each item must pass, such as [=[$Item] > 0] or [=EveryNth([$Index], 2)]. Left off keeps every item.',
        ),
        'Item',
      ),
      {
        ...solidScriptParameterWrites(
          solidScriptParameter(
            'into',
            'Into',
            'name',
            'Filtered',
            'Variable that gets the items that pass, a list, such as Filtered.',
          ),
          { rule: 'kind', kind: 'List', what: 'filtered list of **{command}**' },
        ),
        into: 'label',
      },
    ],
    listing: (read) => [
      'Filter List',
      read.value('list'),
      ...(read.text('where').trim() === '' ? [] : [' Where ', read.value('where')]),
      ' Into ',
      read.value('into'),
    ],
    execute: (run) => {
      const kept = run
        .list('list')
        .filter((item, index, all) =>
          solidScriptConditionHolds(run, 'where', { $Item: item, $Index: index, $Count: all.length }),
        );
      run.variableSet(run.text('into').trim(), kept);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'sort_list',
    label: 'Sort List',
    category: 'Lists',
    description: 'Put a list in order',
    manual:
      'Puts the items of a list in order: numbers from small to big, words from A to Z, numbers before words. Switch on Biggest First to turn the order around. By, when given, is a 🔁 value worked out for each item as [$Item], and the items are ordered by it instead, such as faces by height or points by distance; items with the same By keep their order. Example: Heights holds 5, 2, 9. Sort List Heights leaves 2, 5, 9, Sort List [Spots] By [=[$Y]] puts the lowest point first, and By [=Random(0, 1)] shuffles a list.',
    stops: [SOLID_SCRIPT_LIST_STOP],
    parameters: [
      SOLID_SCRIPT_LIST_NAME,
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'by',
          'By',
          'value',
          'What to order each item by, such as [=[$Y]] for faces by height or [=Random(0, 1)] to shuffle. Left off orders the items themselves.',
        ),
        'Item',
      ),
      solidScriptParameter(
        'descending',
        'Biggest First',
        'boolean',
        'No',
        'Put the biggest number or last word first. Type Yes or No, such as Yes.',
      ),
    ],
    listing: (read) => [
      'Sort List',
      read.value('list'),
      ...(read.text('by').trim() === '' ? [] : [' By ', read.value('by')]),
      ...solidScriptListingOptions([read.on('descending') && ['Biggest First']]),
    ],
    execute: (run) => {
      const sign = run.fields().flag('descending') ? -1 : 1;
      run.listUpdate(run.text('list'), (items) => solidScriptListSorted(run, items, sign), false);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'reverse_list',
    label: 'Reverse List',
    category: 'Lists',
    description: 'Turn a list back to front',
    manual:
      'Turns a list around, so the last item comes first. Example: Heights holds 1, 2, 3. Reverse List Heights leaves 3, 2, 1.',
    stops: [SOLID_SCRIPT_LIST_STOP],
    parameters: [SOLID_SCRIPT_LIST_NAME],
    listing: (read) => ['Reverse List', read.value('list')],
    execute: (run) => {
      run.listUpdate(run.text('list'), (items) => [...items].reverse(), false);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'clear_variable',
    label: 'Clear Variable',
    category: 'Lists',
    description: 'Empty a variable or a list',
    manual:
      'Empties a variable but keeps its name: a list keeps no items, and anything else becomes empty text. Example: Clear Variable Heights empties the list Heights, so [Heights.Count] is 0. A name not set yet becomes an empty list, ready for Add Item.',
    stops: ['An input. Inputs can only be read.'],
    parameters: [solidScriptParameterWrites(SOLID_SCRIPT_LIST_VARIABLE_FIELD, { rule: 'emptied' })],
    listing: (read) => ['Clear Variable', read.value('name')],
    execute: (run) => {
      run.variableClear(run.text('name'));
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'delete_variable',
    label: 'Delete Variable',
    category: 'Lists',
    description: 'Forget a variable',
    manual:
      'Forgets a variable, as if it was never set. Reading it afterwards stops the script, until a line sets it again. With a Persistent. name, it is no longer kept between runs. Example: Delete Variable Step forgets Step.',
    stops: ['A name that is not set.', 'An input. Inputs can only be read.'],
    parameters: [solidScriptParameterWrites(SOLID_SCRIPT_LIST_VARIABLE_FIELD, { rule: 'forgotten' })],
    listing: (read) => ['Delete Variable', read.value('name')],
    execute: (run) => {
      run.variableDelete(run.text('name'));
      return [];
    },
  }),
];
