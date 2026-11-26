import { solidScriptListingOf } from './solid_script_command_listing.js';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import {
  solidScriptParameter,
  solidScriptParameterOf,
  solidScriptParameterOptional,
  solidScriptParameterWrites,
} from './solid_script_command_parameters.js';
import { solidScriptDataItems } from './solid_script_commands_data.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptNameKey } from '@/solid_script/language/solid_script_name_key.js';
import { solidScriptDictionaryFrom } from '@/solid_script/language/solid_script_functions_dictionary.js';

/**
 * Reads a key name that must not be empty.
 *
 * @param run Running line.
 * @param key Parameter key.
 * @param message Message when it is empty.
 * @returns Key as written.
 */
function solidScriptDataKeyName(run: SolidScriptBlockRun, key: string, message: string): string {
  const name = run.text(key).trim();
  if (name === '') throw new Error(message);
  return name;
}

/**
 * Moves the value under one .Data key to another on each item; items without
 * the key are left as they are.
 *
 * @param run Running line.
 */
function solidScriptDataRename(run: SolidScriptBlockRun): void {
  const from = solidScriptNameKey(solidScriptDataKeyName(run, 'key', 'Rename Data needs a Key, such as Heat'));
  const name = solidScriptDataKeyName(run, 'to', 'Rename Data needs a To, such as Warmth');
  const to = solidScriptNameKey(name);
  if (from === to) return;
  for (const item of solidScriptDataItems(run, 'Rename Data', true)) {
    const value = run.elements.dataRead(item, from);
    if (value === '') continue;
    run.elements.dataRemove(item, from);
    run.elements.dataWrite(item, to, name, value);
  }
}

/**
 * Removes one .Data key from each item.
 *
 * @param run Running line.
 */
function solidScriptDataRemove(run: SolidScriptBlockRun): void {
  const key = solidScriptNameKey(solidScriptDataKeyName(run, 'key', 'Remove Data needs a Key, such as Heat'));
  for (const item of solidScriptDataItems(run, 'Remove Data', true)) run.elements.dataRemove(item, key);
}

/** Of and Where shared by the key lines. */
const SOLID_SCRIPT_DATA_KEYS_OF = [
  solidScriptParameterOfWhere('Item', '[=[$Item.Normal.Y] > 0]'),
  solidScriptParameterOf('faces, edges, vertices or dictionaries', '$Selected.Faces', [
    'Face',
    'Edge',
    'Vertex',
    'Dictionary',
  ]),
];

/** Parameter of the .Data key a line works on. */
const SOLID_SCRIPT_DATA_KEYS_KEY = solidScriptParameter(
  'key',
  'Key',
  'text',
  'Heat',
  'The .Data key, such as Heat for [Face.Data.Heat].',
);

/** Commands that make a Dictionary, and rename or remove .Data keys. */
export const SOLID_SCRIPT_COMMANDS_DATA_KEYS: SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'make_dictionary',
    label: 'Make Dictionary',
    category: 'Data',
    description: 'Make a Dictionary of values looked up by a key',
    synonyms: ['map', 'table', 'bundle', 'lookup'],
    manual:
      'Writes a new Dictionary to Into: values looked up by a key, read and written like .Data. Keys and Values are two lists in the same order, such as Wood, Stone and 5, 7; left off, the Dictionary starts empty. Read a value with [Prices.Data.Wood], or [Prices.Data.[Name]] for a key in a variable, change or add one with Add Entry or Set Prices.Data.Wood, add a whole Dictionary with Merge Dictionary, loop over it with For Each with a Key, take a key out with Remove Entry, and rename one with Rename Data Of [Prices]. [=Keys([Prices])], [=Values([Prices])] and [=Contains([Prices], "Wood")] read it in formulas. Setting it to another name copies it. Example: Make Dictionary Into [Prices] Keys Wood, Stone Values 5, 7, then [Prices.Data.Stone] reads 7.',
    stops: ['Keys and Values that are not lists of the same length.', 'A key that is not a name, such as 2nd.'],
    parameters: [
      {
        ...solidScriptParameterWrites(
          solidScriptParameter('into', 'Into', 'name', 'Prices', 'Variable that gets the Dictionary, such as Prices.'),
          { rule: 'kind', kind: 'Dictionary', what: 'Dictionary of **{command}**', keys: 'keys' },
        ),
        into: 'label',
      },
      solidScriptParameterOptional(
        'keys',
        'Keys',
        'value',
        'The keys, such as Wood, Stone or [Names]. Left off starts empty.',
      ),
      solidScriptParameterOptional(
        'values',
        'Values',
        'value',
        'A value for each key, in the same order, such as 5, 7.',
      ),
    ],
    listing: (read) => [
      'Make Dictionary',
      ' Into ',
      read.value('into'),
      ...(read.text('keys').trim() === '' ? [] : [' Keys ', read.value('keys'), ' Values ', read.value('values')]),
    ],
    execute: (run) => {
      const made = solidScriptDictionaryFrom(run.list('keys'), run.list('values'), 'Make Dictionary');
      run.variableSet(run.text('into').trim(), made);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'rename_data',
    label: 'Rename Data',
    category: 'Data',
    description: 'Move a .Data value to a new key',
    manual:
      'Moves the value under .Data Key of each item in Of that passes the 🔁 Where to the key To; Key then reads as empty. A value already under To is replaced, and items without Key are left as they are. Of gives faces, edges, corners or dictionaries; empty uses [$Selected.Faces]. Example: Rename Data Key Heat To Warmth Of [Box.Faces], then [Box.Faces(0).Data.Warmth] reads what Heat held.',
    stops: ['An empty Key or To.', 'No items: an empty Of with nothing in [$Selected.Faces].'],
    parameters: [
      SOLID_SCRIPT_DATA_KEYS_KEY,
      solidScriptParameter('to', 'To', 'text', 'Warmth', 'The new key, such as Warmth.'),
      ...SOLID_SCRIPT_DATA_KEYS_OF,
    ],
    listing: (read) => [
      'Rename Data',
      ' Key ',
      read.value('key'),
      ' To ',
      read.value('to'),
      ...solidScriptListingOf(read),
    ],
    execute: (run) => {
      solidScriptDataRename(run);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'remove_data',
    label: 'Remove Data',
    category: 'Data',
    description: 'Remove a .Data key',
    manual:
      'Removes .Data Key from each item in Of that passes the 🔁 Where, so it reads as empty again. Of gives faces, edges, corners or dictionaries; empty uses [$Selected.Faces]. Example: Remove Data Key Heat Of [Box.Faces], or Remove Data Key Wood Of [Prices].',
    stops: ['An empty Key.', 'No items: an empty Of with nothing in [$Selected.Faces].'],
    parameters: [SOLID_SCRIPT_DATA_KEYS_KEY, ...SOLID_SCRIPT_DATA_KEYS_OF],
    listing: (read) => ['Remove Data', ' Key ', read.value('key'), ...solidScriptListingOf(read)],
    execute: (run) => {
      solidScriptDataRemove(run);
      return [];
    },
  }),
];
