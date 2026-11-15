import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import { solidScriptParameter } from './solid_script_command_parameters.js';
import { solidScriptValueText, solidScriptValueTruthy } from '@/solid_script/language/solid_script_value.js';
import { SOLID_SCRIPT_PART_DEPTH_MAX, type SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine.js';

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
  return Array.from({ length: rounds }, (_, round) => from + round * step);
}

/** Commands for values, loops, conditions, parts and notes. */
export const SOLID_SCRIPT_COMMANDS_LOGIC: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'variable',
    label: 'Set',
    category: 'Logic',
    description: 'Set a variable to a value',
    manual:
      'Gives a name to a value so later lines can use the name instead of the number. Lines below this one see the new value; lines above it do not. Setting the same name again changes it, so a Set inside a Repeat can count up. Use the variable in any field as [width], or compute with it as [=[width] * 2]. Example: Set [width] to 3, then a Cube of size [width], 1, 1 and a Translate by [width], 0, 0 stay in step when you change width once. Lists: Set points() adds an item at the end of the list points, Set points(2) changes item 2 (items count from 0), [points(2)] reads it and [points().count] is how many items there are.',
    stops: [
      'A name that is not letters, digits and _, or starts with a digit.',
      'A [name] for a variable not set above this line, or a [=formula] that cannot be read.',
      'Setting an input of the script, which can only be read.',
      'An item number past the end of a list, such as points(5) when points has 3 items.',
    ],
    parameters: [
      solidScriptParameter(
        'name',
        'Variable',
        'target',
        'width',
        'Letters, digits and _, not starting with a digit. For a list: points() adds an item, points(2) changes item 2.',
      ),
      solidScriptParameter(
        'value',
        'Value',
        'value',
        '2',
        'A number, numbers separated by commas such as 1, 2, 3, plain text, [name] for another variable, or [=formula] such as [=[width] * 2].',
      ),
    ],
    listing: (read) => ['Set', read.variable('name'), ':  ', read.value('value')],
    execute: (run) => {
      run.variableSet(run.text('name'), run.value('value'));
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'repeat',
    label: 'Repeat',
    category: 'Logic',
    description: 'Run lines several times',
    manual:
      'Runs the lines between this line and its End once for every counter value, from Start to End Value, adding Step each time. The lines inside can use the counter. Example: Repeat [i] from 0 to 4 around a Translate by [=[i] * 2], 0, 0 and a Cube builds five cubes in a row, two metres apart.',
    stops: [
      'A Step of 0, or a Step that walks away from End Value.',
      `More than ${SOLID_SCRIPT_REPEAT_ROUNDS_MAX} rounds.`,
      'A counter name that is not letters, digits and _.',
      'A missing End line.',
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameter('variable', 'Counter', 'name', 'i', 'Name the lines inside use for the current round.'),
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
    description: 'Run lines once per list item',
    manual:
      'Runs the lines between this line and its End once for every item of a list, with the counter set to that item. The list can be numbers separated by commas, or a list variable such as [points]. Example: For Each [h] in 1, 2, 4 around a Translate by [h], 0, 0 and a Cube builds three cubes at 1, 2 and 4 metres.',
    stops: [
      `More than ${SOLID_SCRIPT_REPEAT_ROUNDS_MAX} items.`,
      'A counter name that is not letters, digits and _.',
      'A missing End line.',
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameter('variable', 'Counter', 'name', 'item', 'Name the lines inside use for the current item.'),
      solidScriptParameter(
        'list',
        'List',
        'value',
        '1, 2, 3',
        'Items separated by commas, or a list variable such as [points].',
      ),
    ],
    listing: (read) => ['For Each', read.variable('variable'), ' in ', read.value('list')],
    execute: (run) => {
      const list = run.value('list');
      const items = Array.isArray(list) ? list : [list];
      if (items.length > SOLID_SCRIPT_REPEAT_ROUNDS_MAX)
        throw new Error(`For Each would run ${items.length} times, more than ${SOLID_SCRIPT_REPEAT_ROUNDS_MAX}`);
      return run.repeated(run.text('variable'), items);
    },
  }),
  new SolidScriptCommand({
    id: 'if',
    label: 'If',
    category: 'Logic',
    description: 'Run lines only when a condition holds',
    manual:
      'Runs the lines between this line and its Else (or End) only when the condition holds. The condition is a formula without the =; write variables as [name]. An Else before the End starts the lines that run otherwise. Example: If [i] % 2 == 0 inside a Repeat builds something on every other round only.',
    stops: [
      'A [name] for a variable not set above this line, or a condition that cannot be read.',
      'A missing End line.',
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameter(
        'condition',
        'Condition',
        'condition',
        '[i] % 2 == 0',
        'A comparison such as [width] > 2; use == to compare and [name] for variables.',
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
      'Inside an If, ends the lines that run when the condition holds and starts the lines that run when it does not. Example: If [width] > 2, a long beam, Else, a short post, End.',
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
      'Marks where the block above it ends: the lines between a block line, such as Translate or Repeat, and its End belong to that block. Inserting a block adds its End for you; move both to change what the block holds.',
    stops: ['Having no block above it to end.'],
    nesting: 'close',
    parameters: [],
    inPalette: false,
    listing: () => ['End'],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: 'echo',
    label: 'Echo',
    category: 'Logic',
    description: 'Write a message to the output',
    manual:
      'Writes a message to the Output below the script while it runs, to check what a variable or formula gives. The message is plain text without quotes; [name] puts in a variable and [=formula] a result. Example: Width is [width], double is [=[width] * 2].',
    stops: [
      'A [name] for a variable not set above this line, or a [=formula] that cannot be read.',
      'A [ without its ]; write $[ and $] for brackets.',
    ],
    parameters: [
      solidScriptParameter(
        'value',
        'Message',
        'message',
        'Hello',
        'Plain text; [name] puts in a variable, [=formula] a result, $[ and $] write brackets.',
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
    listing: (read) => [{ kind: 'note', text: `***  ${read.text('text')}` }],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: SOLID_SCRIPT_COMMAND_BLANK,
    label: 'Blank Line',
    category: 'Logic',
    description: 'Leave a line empty',
    manual:
      'An empty line that keeps parts of a script apart, to make it easier to read. It does nothing when the script runs; inserting a command fills it.',
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
    description: 'Name lines to build elsewhere',
    manual:
      'Names the lines between this line and its End as a part. They build nothing here; they build wherever a Use Part line asks for them, moved by the blocks around that line. The part name also names the brushes it builds. Example: define a part post with one tall Cube, then Use Part post inside two Translates for two posts.',
    stops: ['A name already used by another part.', 'A name that is not letters, digits and _.', 'A missing End line.'],
    nesting: 'open',
    parameters: [
      solidScriptParameter('name', 'Name', 'name', 'part', 'Name Use Part refers to; it also names the brushes.'),
    ],
    listing: (read) => ['::', read.text('name')],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: 'return',
    label: 'Return',
    category: 'Parts',
    description: 'Leave the part early',
    manual:
      'Stops building the part this line is in, like leaving a subroutine: the lines after it in the part are skipped, and the script carries on after the Use Part line that called the part. Shapes the part built before it stay. Put it inside an If to stop early on a condition. Example: in a part that builds a stair step, If [=[n] > 20] then Return stops it at twenty steps.',
    stops: ['Being placed outside a Define Part.'],
    parameters: [],
    listing: () => ['Return'],
    execute: (run) => run.leave(),
  }),
  new SolidScriptCommand({
    id: 'use_part',
    label: 'Use Part',
    category: 'Parts',
    description: 'Build a part here',
    manual:
      'Builds the lines of a part defined with Define Part, here, moved by the blocks around this line, and then carries on with the next line, like a call that returns. A part may be used any number of times, and Define Part may come before or after it. The part sees the variables of the line that uses it, and Set inside the part changes a variable that already exists outside, so a part can hand back results. The name may be a variable, such as [style], to choose a part while the script runs. A part may use itself, as long as an If stops it. Example: Use Part post inside Translate by 2, 0, 0 builds the post two metres to the right.',
    stops: ['No part with this name.', `Parts used inside each other more than ${SOLID_SCRIPT_PART_DEPTH_MAX} deep.`],
    parameters: [
      solidScriptParameter(
        'name',
        'Name',
        'message',
        'part',
        'Name of a part defined in this script, or a variable such as [style] that holds one.',
      ),
    ],
    listing: (read) => ['Use Part', { kind: 'value', text: `'${read.text('name')}'` }],
    execute: (run) => run.partUse(String(run.value('name')).trim()),
  }),
];
