import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import { solidScriptParameter, solidScriptParameterOptional } from './solid_script_command_parameters.js';
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
      'Gives a value a name, so later lines can use the name. Lines below see the new value. Lines above do not. Setting the same name again changes it, so a Set in a Repeat can count up. Read it in any field as [Width], or compute with it as [=[Width] * 2]. Example: Set [Width] to 3, then a Cube of size [Width], 1, 1. Lists: Set points() adds an item at the end. Set points(2) changes item 2. Items count from 0. [points(2)] reads one item, and [points().count] says how many there are.',
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
        'Letters, digits and _, not starting with a digit. For a list, points() adds an item and points(2) changes item 2.',
      ),
      solidScriptParameter(
        'value',
        'Value',
        'value',
        '2',
        'A number, numbers separated by commas such as 1, 2, 3, plain text, [name] for another variable, or [=formula] such as [=[Width] * 2].',
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
      'Runs the lines inside once for each counter value. The counter goes from Start to End Value, adding Step each round. The lines inside can read the counter. Example: Repeat [I] from 0 to 4 around Translate by [=[I] * 2], 0, 0 and a Cube builds five cubes in a row.',
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
      'Runs the lines inside once for each item of a list. The counter holds the current item. The list can be numbers separated by commas, or a list variable such as [points]. Example: For Each [H] in 1, 2, 4 around Translate by [H], 0, 0 and a Cube builds three cubes.',
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
    description: 'Run lines only when something is true',
    manual:
      'Runs the lines inside only when the condition is true. Write the condition like a formula, but without the =. Write variables as [name]. An Else starts the lines that run when it is false. Example: If [I] % 2 == 0 inside a Repeat builds on every second round.',
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
      'Marks where a block ends. The lines between a block line, such as Repeat, and its End belong to that block. Inserting a block adds its End for you.',
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
      'Writes a message to the Output while the script runs. Use it to check a value. Write plain text, without quotes. [name] puts in a variable, and [=formula] puts in a result. Example: Width is [Width], double is [=[Width] * 2].',
    stops: [
      'A [name] for a variable not set above this line, or a [=formula] that cannot be read.',
      'A [ without its ]. Write $[ and $] for real brackets.',
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
      'Names a group of lines as a part. They build nothing where they stand. They build wherever a Use Part line asks for them. The part name also names the brushes it builds. Example: Define Part post holds one tall Cube. Two Use Part post lines inside two Translates build two posts.',
    stops: ['A name already used by another part.', 'A name that is not letters, digits and _.', 'A missing End line.'],
    nesting: 'open',
    parameters: [
      solidScriptParameter('name', 'Name', 'name', 'part', 'The name Use Part uses. It also names the brushes.'),
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
      'Stops a Function or a part early. The lines after it are skipped. The script goes on after the Call or Use Part that started it. In a Function, Return can give back a value. A Call line stores that value in its Result In variable. Shapes built before Return stay. Put Return inside an If to stop only sometimes. Example: Return [local.V] gives back the value v.',
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
      'Builds a part here, then goes on with the next line. Define the part with Define Part, above or below this line. The blocks around this line move what the part builds. A part may be used many times. It shares the variables of the script, so a Set inside it can hand back a result. The name may be a variable, such as [Style]. A part may use itself, but an If must stop it. Example: Use Part post inside Translate by 2, 0, 0 builds the post two metres to the right.',
    stops: ['No part with this name.', `Parts using each other more than ${SOLID_SCRIPT_PART_DEPTH_MAX} levels deep.`],
    parameters: [
      solidScriptParameter(
        'name',
        'Name',
        'message',
        'part',
        'Name of a part defined in this script, or a variable such as [Style] that holds one.',
      ),
    ],
    listing: (read) => ['Use Part', { kind: 'value', text: `'${read.text('name')}'` }],
    execute: (run) => run.partUse(String(run.value('name')).trim()),
  }),
  new SolidScriptCommand({
    id: 'label',
    label: 'Label',
    category: 'Logic',
    description: 'Mark a place a Go To can jump to',
    manual:
      'Marks a place among the lines. It does nothing by itself; a Go To with the same name carries on from here. Names ignore case. Each Label needs its own name among the lines it stands in. Example: Label Again, then lines that build a ring, then If [Rings] < 3 around Set [Rings] to [=[Rings] + 1] and Go To Again builds three rings.',
    stops: ['An empty name.', 'Two Labels with the same name among the same lines.'],
    parameters: [solidScriptParameter('name', 'Name', 'name', 'Again', 'The name a Go To jumps to.')],
    listing: (read) => ['Label', read.text('name')],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: 'go_to',
    label: 'Go To',
    category: 'Logic',
    description: 'Jump to a Label and carry on from there',
    manual:
      'Skips the lines after it and carries on from the Label with this name, forwards or backwards. The Label may stand among the same lines or among the lines around them, so a Go To inside an If or a Repeat can leave it. It cannot leave a Function; use Return there. A Go To that keeps jumping back is stopped like any runaway loop. For work you run from many places, a Function with Call is clearer, since it comes back. Example: If [Width] <= 0 around Go To Done skips everything down to Label Done.',
    stops: [
      'No Label with this name among its lines or the lines around them.',
      'A Label outside the Function it is in.',
    ],
    parameters: [solidScriptParameter('name', 'Label', 'name', 'Again', 'Name of the Label to carry on from.')],
    listing: (read) => ['Go To', read.text('name')],
    execute: (run) => run.jump(run.text('name').trim()),
  }),
  new SolidScriptCommand({
    id: 'stop_script',
    label: 'Stop Script',
    category: 'Logic',
    description: 'End the script here, keeping what it built',
    manual:
      'Ends the whole script at this line, also from inside a Repeat, a part or a Function. Shapes built before it stay; the lines after it do not run. It is not a mistake, so nothing is highlighted. Example: If [Steps] == 0 around Echo Nothing to build and Stop Script.',
    stops: [],
    parameters: [],
    listing: () => ['Stop Script'],
    execute: (run) => run.jump(null),
  }),
];
