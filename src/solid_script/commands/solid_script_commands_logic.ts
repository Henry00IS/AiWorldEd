import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import { solidScriptParameter } from './solid_script_command_parameters.js';
import { solidScriptValueText, solidScriptValueTruthy } from '@/solid_script/language/solid_script_value.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine.js';

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
      'Gives a name to a value so later lines can use the name instead of the number. Lines below this one see the new value; lines above it do not. Setting the same name again changes it, so a Set inside a Repeat can count up. Use the variable in any field as [width], or compute with it as [=[width] * 2]. Example: Set [width] to 3, then a Cube of size [width], 1, 1 and a Translate by [width], 0, 0 stay in step when you change width once.',
    stops: [
      'A name that is not letters, digits and _, or starts with a digit.',
      'A [name] for a variable not set above this line, or a [=formula] that cannot be read.',
      'Setting an input of the script, which can only be read.',
    ],
    parameters: [
      solidScriptParameter('name', 'Variable', 'name', 'width', 'Letters, digits and _; must not start with a digit.'),
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
    id: 'use_part',
    label: 'Use Part',
    category: 'Parts',
    description: 'Build a part here',
    manual:
      'Builds the lines of a part defined with Define Part, here, moved by the blocks around this line. A part may be used any number of times, and Define Part may come before or after it. Example: Use Part post inside Translate by 2, 0, 0 builds the post two metres to the right.',
    stops: ['No part with this name.', 'A part that uses itself.'],
    parameters: [solidScriptParameter('name', 'Name', 'name', 'part', 'Name of a part defined in this script.')],
    listing: (read) => ['Use Part', { kind: 'value', text: `'${read.text('name')}'` }],
    execute: (run) => run.partUse(run.text('name')),
  }),
];
