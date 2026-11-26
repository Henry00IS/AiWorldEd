import {
  SolidScriptCommand,
  type SolidScriptCommandGives,
  type SolidScriptCommandParameter,
} from './solid_script_command.js';
import { solidScriptParameter, solidScriptParameterWrites } from './solid_script_command_parameters.js';
import {
  solidScriptDictionaryAdd,
  solidScriptDictionaryKey,
  solidScriptDictionaryMerge,
  solidScriptDictionaryRemove,
  solidScriptDictionarySource,
  type SolidScriptDictionaryKey,
} from '@/solid_script/language/solid_script_dictionary_edit.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';

/** Name field of a Dictionary. */
const SOLID_SCRIPT_DICTIONARY_FIELD = solidScriptParameter(
  'dictionary',
  'Dictionary',
  'name',
  'Prices',
  'Name of the Dictionary, without brackets, such as Prices.',
);

/** Key field of a line that works on one key. */
const SOLID_SCRIPT_DICTIONARY_KEY_FIELD = solidScriptParameter(
  'key',
  'Key',
  'text',
  'Wood',
  'The key, such as Wood. Keys use letters, digits and _, and do not start with a digit. [Material] uses the key the variable Material holds.',
);

/** Stop shared by lines that need an existing Dictionary. */
const SOLID_SCRIPT_DICTIONARY_STOP = 'A name that is not a Dictionary, or no Dictionary of that name yet.';

/** Stop shared by lines that read a key. */
const SOLID_SCRIPT_DICTIONARY_KEY_STOP = 'A key that is empty or not a name, such as 2nd.';

/**
 * Reads the Key field of a line.
 *
 * @param run Running line.
 * @param label Line label, for messages.
 * @returns The checked key.
 */
function solidScriptDictionaryKeyRun(run: SolidScriptBlockRun, label: string): SolidScriptDictionaryKey {
  return solidScriptDictionaryKey(run.text('key'), label);
}

/**
 * Describes the Dictionary field of a line that changes it.
 *
 * @param rule What the line does to the variable.
 * @returns Field.
 */
function solidScriptDictionaryChanged(rule: SolidScriptCommandGives): SolidScriptCommandParameter {
  return solidScriptParameterWrites(SOLID_SCRIPT_DICTIONARY_FIELD, rule);
}

/** Commands that change a Dictionary in plain words, like the List lines. */
export const SOLID_SCRIPT_COMMANDS_DICTIONARY: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'add_entry',
    label: 'Add Entry',
    category: 'Data',
    description: 'Put a value under a key in a Dictionary',
    synonyms: ['set key', 'put', 'store'],
    manual:
      'Puts a value under a key in a Dictionary: a new key goes last, and a key the Dictionary already has gets the new value. A Dictionary that does not exist yet is made. Example: Add Entry Key Wood Value 5 To Prices, then Add Entry Key Stone Value 7 To Prices, and [Prices.Data.Wood] reads 5. Adding Wood again with Value 9 changes it to 9.',
    stops: [SOLID_SCRIPT_DICTIONARY_KEY_STOP, 'A name that is set but is not a Dictionary.'],
    parameters: [
      SOLID_SCRIPT_DICTIONARY_KEY_FIELD,
      solidScriptParameter('value', 'Value', 'value', '1', 'What to keep under the key, such as 5 or [Item].'),
      solidScriptDictionaryChanged({ rule: 'entries', what: 'Dictionary', keys: 'key' }),
    ],
    listing: (read) => [
      'Add Entry',
      ' Key ',
      read.value('key'),
      ' Value ',
      read.value('value'),
      ' To ',
      read.value('dictionary'),
    ],
    execute: (run) => {
      const key = solidScriptDictionaryKeyRun(run, 'Add Entry');
      const value = run.value('value');
      run.dictionaryChange(run.text('dictionary'), true, (dictionary) =>
        solidScriptDictionaryAdd(dictionary, key, value),
      );
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'remove_entry',
    label: 'Remove Entry',
    category: 'Data',
    description: 'Take a key out of a Dictionary',
    manual:
      'Takes a key and its value out of a Dictionary, so it reads as empty again. A key that is not in the Dictionary changes nothing. Example: Prices holds Wood 5 and Stone 7. Remove Entry Key Wood From Prices leaves Stone 7.',
    stops: [SOLID_SCRIPT_DICTIONARY_STOP, SOLID_SCRIPT_DICTIONARY_KEY_STOP],
    parameters: [SOLID_SCRIPT_DICTIONARY_KEY_FIELD, solidScriptDictionaryChanged({ rule: 'kept' })],
    listing: (read) => ['Remove Entry', ' Key ', read.value('key'), ' From ', read.value('dictionary')],
    execute: (run) => {
      const key = solidScriptDictionaryKeyRun(run, 'Remove Entry');
      run.dictionaryChange(run.text('dictionary'), false, (dictionary) => solidScriptDictionaryRemove(dictionary, key));
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'merge_dictionary',
    label: 'Merge Dictionary',
    category: 'Data',
    description: 'Add every entry of one Dictionary to another',
    manual:
      'Adds every key of the From Dictionary to the Dictionary named in Into: a key both have gets the value of From, and new keys go last in the order From has them. From stays as it was. An Into that does not exist yet is made as a copy of From. Example: Prices holds Wood 5, Extra holds Wood 6 and Glass 12. Merge Dictionary [Extra] Into Prices leaves Wood 6, Glass 12.',
    stops: ['A From that is not a Dictionary.', 'An Into that is set but is not a Dictionary.'],
    parameters: [
      solidScriptParameter('from', 'From', 'value', '[Extra]', 'The Dictionary to take entries from, such as [Extra].'),
      solidScriptParameterWrites(
        {
          ...SOLID_SCRIPT_DICTIONARY_FIELD,
          label: 'Into',
          hint: 'Name of the Dictionary that gets the entries, such as Prices.',
        },
        { rule: 'entries', what: 'Dictionary', keys: 'from' },
      ),
    ],
    listing: (read) => ['Merge Dictionary', read.value('from'), ' Into ', read.value('dictionary')],
    execute: (run) => {
      const into = run.text('dictionary');
      const entries = solidScriptDictionarySource(run.value('from'), 'Merge Dictionary');
      run.dictionaryChange(into, true, (dictionary) => solidScriptDictionaryMerge(dictionary, entries));
      return [];
    },
  }),
];
