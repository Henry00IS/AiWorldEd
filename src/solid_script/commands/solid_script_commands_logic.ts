import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterOptional,
  solidScriptParameterWords,
  solidScriptParameterWrites,
} from './solid_script_command_parameters.js';
import {
  SOLID_SCRIPT_TYPES,
  solidScriptTypePlaceholder,
  solidScriptTypeWords,
} from '@/solid_script/language/solid_script_types.js';
import {
  SolidScriptElement,
  solidScriptValueText,
  solidScriptValueTruthy,
} from '@/solid_script/language/solid_script_value.js';
import { SOLID_SCRIPT_PART_DEPTH_MAX } from '@/solid_script/language/solid_script_machine_calls.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';

/** Id of the command that closes a block. */
export const SOLID_SCRIPT_COMMAND_END = 'end';

/** Id of the command of an empty line, which inserting a command fills. */
export const SOLID_SCRIPT_COMMAND_BLANK = 'blank';

/** Most rounds one Repeat may run. */
const SOLID_SCRIPT_REPEAT_ROUNDS_MAX = 10000;

/**
 * Lists the counter values of a Repeat line: Start, then Start + Step, up to
 * and including End Value.
 *
 * @param run Running line.
 * @returns Counter values.
 */
function solidScriptRepeatValues(run: SolidScriptBlockRun): number[] {
  const fields = run.fields();
  const from = fields.number('from', 0);
  const to = fields.number('to', 0);
  const step = fields.number('step', 1);
  if (step === 0) throw fields.error('step', 'must not be 0, or the counter never reaches the end', step);
  if ((to - from) / step < 0)
    throw new Error(`the counter cannot get from ${from} to ${to} by adding ${step}; change Step to ${-step}`);
  const rounds = Math.floor((to - from) / step + 1e-9) + 1;
  if (rounds > SOLID_SCRIPT_REPEAT_ROUNDS_MAX)
    throw new Error(`Repeat would run ${rounds} times; at most ${SOLID_SCRIPT_REPEAT_ROUNDS_MAX} are allowed`);
  const values = new Array<number>(rounds);
  for (let round = 0; round < rounds; round++) values[round] = from + round * step;
  return values;
}

/** Commands for values, loops, conditions, parts and notes. */
export const SOLID_SCRIPT_COMMANDS_LOGIC: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'variable',
    label: 'Set',
    category: 'Logic',
    description: 'Set a variable to a value',
    manual:
      'Gives a value a name, so later lines can use the name. Lines below see the new value. Lines above do not. Setting the same name again changes it, so a Set in a Repeat can count up. Read it in any field as [Width], or compute with it as [=[Width] * 2]. Example: Set [Width] to 3, then a Cube of size [Width], 1, 1. Commas typed outside brackets make a list, each item read on its own: [5, 3, 4], zu, 45 is a vector, a text and a number, three plain numbers such as 1, 2, 3 are a vector, and $, keeps a comma in a text such as Hello$, World. Lists: Set Points() adds an item at the end. Set Points(2) changes item 2. Items count from 0. [Points(2)] reads one item, and [Points.Count] says how many there are. Data: Set Face.Data.Height keeps your own value on a face, brush, edge or corner. Through a list it sets every item, so Set Brush.Edges.Data.Kind to trim marks every edge of [Brush], and Brush.Faces(0).Edges.Data.Kind only the edges of its first face. The key may come from a variable, such as Brush.Data.[Key].',
    stops: [
      'A name that is not letters, digits and _, or starts with a digit.',
      'A [Name] for a variable not set above this line, or a [=formula] that cannot be read.',
      'Setting an input of the script, which can only be read.',
      'A value that does not fit the Type declared for the variable, here or on a Set above; every other line writing it, such as Add Item or Into, stops the same way.',
      'Setting a member such as Face.Center or Brush.Edges, which can only be read; only the values under .Data can be set.',
      'An item number past the end of a list, such as Points(5) when Points has 3 items.',
    ],
    parameters: [
      solidScriptParameterWrites(
        solidScriptParameter(
          'name',
          'Variable',
          'target',
          'Width',
          'Letters, digits and _, not starting with a digit. For a list, Points() adds an item and Points(2) changes item 2. Face.Data.Height sets a value under .Data, on every item of a list such as Brush.Edges.Data.Kind.',
        ),
        'path',
      ),
      {
        ...solidScriptParameter(
          'value',
          'Value',
          'value',
          '',
          'A number, numbers separated by commas such as 1, 2, 3, a vector such as [1, 2, 3], a list of any items separated by commas such as [1, 2, 3], zu, 45, plain text ($, for a comma in it), [Name] for another variable, or [=formula] such as [=[Width] * 2]. Left empty it is the empty value of the Type: 0, no text, 0, 0, 0, No or a new empty list.',
        ),
        optional: true,
        follows: { key: 'type', words: solidScriptTypeWords, placeholder: solidScriptTypePlaceholder },
      },
      {
        ...solidScriptParameterWords(
          'type',
          'Type',
          'text',
          '',
          `Optional kind the variable always holds; empty or Any lets it hold anything. One of: ${SOLID_SCRIPT_TYPES.join(', ')}.`,
          SOLID_SCRIPT_TYPES.map((word) => ({
            word,
            detail: word === 'Any' ? 'Anything, also another kind later' : `Always a ${word}`,
          })),
        ),
        optional: true,
      },
    ],
    listing: (read) => [
      'Set',
      read.variable('name'),
      ...(read.text('type').trim() === '' ? [] : [' as ', read.text('type').trim()]),
      ': ',
      read.value('value'),
    ],
    execute: (run) => {
      const type = run.text('type').trim();
      const value = run.valueTyped('value', type);
      run.typeKeep(run.text('name'), type);
      run.variableSet(run.text('name'), value);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'repeat',
    label: 'Repeat',
    category: 'Logic',
    description: 'Run lines several times',
    manual:
      'Runs the lines inside once for each counter value. The counter goes from Start to End Value, adding Step each round. The lines inside can read the counter. Example: Repeat [I] from 0 to 4 around Translate by [=[I] * 2], 0, 0 and a Cube builds five cubes in a row.',
    stops: [
      'A Step of 0, or a Step that walks away from End Value.',
      `More than ${SOLID_SCRIPT_REPEAT_ROUNDS_MAX} rounds.`,
      'A counter name that is not letters, digits and _.',
      'A missing End line.',
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameterWrites(
        solidScriptParameter('variable', 'Counter', 'name', 'I', 'Name the lines inside use for the current round.'),
      ),
      solidScriptParameter('from', 'Start', 'number', '0', 'Counter value of the first round.'),
      solidScriptParameter('to', 'End Value', 'number', '3', 'Counter value of the last round.'),
      solidScriptParameter('step', 'Step', 'number', '1', 'Added to the counter after each round.'),
    ],
    listing: (read) => [
      'Repeat',
      read.variable('variable'),
      ' from ',
      read.value('from'),
      ' to ',
      read.value('to'),
      ...solidScriptListingOptions([read.changed('step') && ['Step ', read.value('step')]]),
    ],
    execute: (run) => run.repeated(run.text('variable'), solidScriptRepeatValues(run)),
  }),
  new SolidScriptCommand({
    id: 'for_each',
    label: 'For Each',
    category: 'Logic',
    description: 'Run lines once per item of a list',
    manual:
      'Runs the lines inside once for each item of a list, with Item holding the current one. The list can be numbers separated by commas, a list variable such as [Points], or geometry such as [$Selected.Faces], [Top.Edges] or [$Input.Brushes]; over [Face.Data] it runs once per user value. Key, when given, holds the item number from 0, or the key name over Data. Inside a round the [$Selected.*] lists start as they were and come back after End. Example: For Each [Face] In [$Selected.Faces], Extrude Face Of [Face] by 0.2, End.',
    stops: [
      `More than ${SOLID_SCRIPT_REPEAT_ROUNDS_MAX} items.`,
      'An Item or Key name that is not letters, digits and _.',
      'A missing End line.',
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameterWrites(
        solidScriptParameter('variable', 'Item', 'name', 'Item', 'Name the lines inside use for the current item.'),
      ),
      solidScriptParameter(
        'list',
        'In',
        'value',
        '1, 2, 3',
        'Items separated by commas, or a list such as [Points], [$Selected.Faces] or [Face.Data].',
      ),
      solidScriptParameterWrites(
        solidScriptParameterOptional(
          'key',
          'Key',
          'name',
          'Name for the item number from 0, or the key name over Data; empty gives none.',
        ),
      ),
    ],
    listing: (read) => [
      'For Each',
      read.variable('variable'),
      ' In ',
      read.value('list'),
      ...(read.text('key').trim() === '' ? [] : [' Key ', read.variable('key')]),
    ],
    execute: (run) => {
      const list = run.list('list');
      const only = list.length === 1 ? list[0] : undefined;
      const entries =
        only instanceof SolidScriptElement && only.kind === 'data' ? run.elements.dataEntries(only) : null;
      const items = entries ? entries.map((entry) => entry.value) : list;
      if (items.length > SOLID_SCRIPT_REPEAT_ROUNDS_MAX)
        throw new Error(`For Each would run ${items.length} times, more than ${SOLID_SCRIPT_REPEAT_ROUNDS_MAX}`);
      const key = run
        .text('key')
        .trim()
        .replace(/^\[(.*)\]$/s, '$1');
      if (key === '') return run.repeated(run.text('variable'), items);
      const keys = entries ? entries.map((entry) => entry.name) : items.map((_, index) => index);
      return run.repeated(run.text('variable'), items, { name: key, keys });
    },
  }),
  new SolidScriptCommand({
    id: 'if',
    label: 'If',
    category: 'Logic',
    description: 'Run lines only when something is True',
    manual:
      'Runs the lines inside only when the condition is True. Write the condition like a formula, but without the =. Write variables as [Name]. An Else starts the lines that run when it is false. Example: If [I] % 2 == 0 inside a Repeat builds on every second round.',
    stops: [
      'A [Name] for a variable not set above this line, or a condition that cannot be read.',
      'A missing End line.',
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameter(
        'condition',
        'Condition',
        'condition',
        '[I] % 2 == 0',
        'A comparison such as [Width] > 2. Use == to test if two values are equal.',
      ),
    ],
    listing: (read) => ['If', read.value('condition')],
    execute: (run) => run.branched(solidScriptValueTruthy(run.value('condition'))),
  }),
  new SolidScriptCommand({
    id: 'else',
    label: 'Else',
    category: 'Logic',
    description: 'Start the lines an If runs otherwise',
    manual:
      'Inside an If, ends the lines that run when the condition holds and starts the lines that run when it does not. Example: If [Width] > 2, a long beam, Else, a short post, End.',
    stops: ['Being outside an If, or a second Else in the same If.'],
    nesting: 'continue',
    parameters: [],
    listing: () => ['Else'],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: SOLID_SCRIPT_COMMAND_END,
    label: 'End',
    category: 'Logic',
    description: 'End a block',
    manual:
      'Marks where a block ends. The lines between a block line, such as Repeat, and its End belong to that block. Inserting a block adds its End for you; add one here when a block misses its End.',
    stops: ['Having no block above it to end.'],
    nesting: 'close',
    parameters: [],
    listing: () => ['End'],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: 'echo',
    label: 'Echo',
    category: 'Logic',
    description: 'Write a message to the output',
    manual:
      'Writes a message to the Output while the script runs. Use it to check a value. Write plain text, without quotes. [Name] puts in a variable, and [=formula] puts in a result. Example: Width is [Width], double is [=[Width] * 2].',
    stops: [
      'A [Name] for a variable not set above this line, or a [=formula] that cannot be read.',
      'A [ without its ]. Write $[ and $] for real brackets.',
    ],
    parameters: [
      solidScriptParameter(
        'value',
        'Message',
        'message',
        'Hello',
        'Plain text; [Name] puts in a variable, [=formula] a result, $[ and $] write brackets.',
      ),
    ],
    listing: (read) => ['@ Echo', read.value('value')],
    execute: (run) => run.print(solidScriptValueText(run.value('value'))),
  }),
  new SolidScriptCommand({
    id: 'note',
    label: 'Note',
    category: 'Logic',
    description: 'Write a note for people',
    manual:
      'A note for people reading the script, such as what the next lines build. It does nothing when the script runs.',
    parameters: [solidScriptParameter('text', 'Text', 'text', 'Describe this part', 'Any text.')],
    runs: false,
    listing: (read) => [{ kind: 'note', text: `*** ${read.text('text')}` }],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: SOLID_SCRIPT_COMMAND_BLANK,
    label: 'Blank Line',
    category: 'Logic',
    description: 'Leave a line empty',
    manual:
      'An empty line that keeps parts of a script apart, so it is easier to read. It does nothing when the script runs.',
    parameters: [],
    inPalette: false,
    runs: false,
    listing: () => [],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: 'part',
    label: 'Define Part',
    category: 'Parts',
    description: 'Group lines to build elsewhere',
    manual:
      'Names a group of lines as a part. They build nothing where they stand. They build wherever a Use Part line asks for them. The part name also names the brushes it builds. Example: Define Part Post holds one tall Cube. Two Use Part Post lines inside two Translates build two posts.',
    stops: ['A name already used by another part.', 'A name that is not letters, digits and _.', 'A missing End line.'],
    nesting: 'open',
    parameters: [
      solidScriptParameter('name', 'Name', 'name', 'Part', 'The name Use Part uses. It also names the brushes.'),
    ],
    endLabel: 'Part',
    listing: (read) => ['Define Part', read.text('name')],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: 'return',
    label: 'Return',
    category: 'Parts',
    description: 'Leave the function or part early',
    manual:
      'Stops a Function or a part early. The lines after it are skipped. The script goes on after the Call or Use Part that started it. In a Function, Return can give back a value. A Call line stores that value in its Result In variable. Brushes built before Return stay. Put Return inside an If to stop only sometimes. Example: Return [Local.V] gives back the value V.',
    stops: ['Being outside a Function or a Define Part.', 'A Value inside a part. Parts hand back results with Set.'],
    parameters: [
      solidScriptParameterOptional(
        'value',
        'Value',
        'value',
        'The value a Function gives back. Leave it empty to give back nothing.',
      ),
    ],
    listing: (read) => ['Return', ...(read.text('value') === '' ? [] : [read.value('value')])],
    execute: (run) => run.leave(run.text('value').trim() === '' ? undefined : run.value('value')),
  }),
  new SolidScriptCommand({
    id: 'use_part',
    label: 'Use Part',
    category: 'Parts',
    description: 'Build a part here',
    manual:
      'Builds a part here, then goes on with the next line. Define the part with Define Part, above or below this line. The blocks around this line move what the part builds. A part may be used many times. It shares the variables of the script, so a Set inside it can hand back a result. The name may be a variable, such as [Style]. A part may use itself, but an If must stop it. Example: Use Part Post inside Translate by 2, 0, 0 builds the post two metres to the right.',
    stops: ['No part with this name.', `Parts using each other more than ${SOLID_SCRIPT_PART_DEPTH_MAX} levels deep.`],
    parameters: [
      {
        ...solidScriptParameter(
          'name',
          'Name',
          'message',
          'Part',
          'Name of a part defined in this script, or a variable such as [Style] that holds one.',
        ),
        nameGroups: ['Parts'],
      },
    ],
    listing: (read) => ['Use Part', { kind: 'value', text: `'${read.text('name')}'` }],
    execute: (run) => run.partUse(String(run.value('name')).trim()),
  }),
  new SolidScriptCommand({
    id: 'stop_script',
    label: 'Stop Script',
    category: 'Logic',
    description: 'End the script here, keeping what it built',
    manual:
      'Ends the whole script at this line, also from inside a Repeat, a part or a Function. Brushes built before it stay; the lines after it do not run. It is not a mistake, so nothing is highlighted. Example: If [Steps] == 0 around Echo Nothing to build and Stop Script.',
    stops: [],
    parameters: [],
    listing: () => ['Stop Script'],
    execute: (run) => run.stop(),
  }),
];
