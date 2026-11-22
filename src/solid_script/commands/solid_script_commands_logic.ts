import { solidScriptParameterEach } from './solid_script_command_each.js';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingNote, solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterGroupMode,
  solidScriptParameterOptional,
  solidScriptParameterWords,
  solidScriptParameterWrites,
} from './solid_script_command_parameters.js';
import {
  SolidScriptElement,
  solidScriptValueText,
  solidScriptValueTruthy,
  type SolidScriptValue,
} from '@/solid_script/language/solid_script_value.js';
import { solidScriptConditionHolds } from '@/solid_script/language/solid_script_condition.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptRunValueOptional } from '@/solid_script/language/solid_script_run_optional.js';
import { SOLID_SCRIPT_REPEAT_ROUNDS_MAX, solidScriptLimitCount } from '@/solid_script/language/solid_script_limits.js';

/**
 * Lists the places of the For Each items that pass its Where, with [$Item] the
 * item; without a Where every item passes.
 *
 * @param run Running For Each line.
 * @param items Items of the list.
 * @returns Places of the kept items, in order.
 */
function solidScriptForEachKept(run: SolidScriptBlockRun, items: readonly SolidScriptValue[]): number[] {
  const places = items.map((_, index) => index);
  if (run.source('where').trim() === '') return places;
  return places.filter((index) =>
    solidScriptConditionHolds(run, 'where', { $Item: items[index], $Index: index, $Count: items.length }),
  );
}

/** Id of the command that closes a block. */
export const SOLID_SCRIPT_COMMAND_END = 'end';

/** Id of the command of an empty line, which inserting a command fills. */
export const SOLID_SCRIPT_COMMAND_BLANK = 'blank';

/** Kinds of Warn line, as typed. */
const SOLID_SCRIPT_WARN_KINDS = ['Warning', 'Stop'] as const;

/**
 * Runs a Warn line: adds its message to the warnings, or stops the script with
 * it when Kind is Stop.
 *
 * @param run Running line.
 */
function solidScriptWarnRun(run: SolidScriptBlockRun): void {
  const typed = run.text('kind').trim() || 'Warning';
  const kind = SOLID_SCRIPT_WARN_KINDS.find((word) => word.toLowerCase() === typed.toLowerCase());
  if (!kind) throw new Error(`Kind needs Warning or Stop, not ${typed}`);
  const text = solidScriptValueText(run.value('text'));
  if (kind === 'Stop') throw new Error(text);
  run.warn(text);
}

/**
 * Lists the counter values of a Repeat line: Start, then Start + Step, up to
 * but not including To, so From 0 To 5 is 0 to 4 and From 0 To 0 runs no
 * round.
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
  const rounds = Math.max(0, Math.ceil((to - from) / step - 1e-9));
  if (rounds > SOLID_SCRIPT_REPEAT_ROUNDS_MAX)
    throw new Error(
      `Repeat would run ${solidScriptLimitCount(rounds)} times, more than ${solidScriptLimitCount(SOLID_SCRIPT_REPEAT_ROUNDS_MAX)}. Change To, or split this into smaller generators.`,
    );
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
      'Gives a value a name, so later lines can use the name. Lines below see the new value. Lines above do not. Setting the same name again changes it, so a Set in a Repeat can count up. Read it in any field as [Width], or compute with it as [=[Width] * 2]. Example: Set [Width] to 3, then a Cube of size [Width], 1, 1. Commas typed outside brackets make a list, each item read on its own: [5, 3, 4], zu, 45 is a vector, a text and a number, three plain numbers such as 1, 2, 3 are a vector, and $, keeps a comma in a text such as Hello$, World. Lists: Set Points() adds an item at the end. Set Points(2) changes item 2. Items count from 0. [Points(2)] reads one item, and [Points.Count] says how many there are. Data: Set Face.Data.Height keeps your own value on a face, solid, edge or corner. Through a list it sets every item, so Set Object.Edges.Data.Kind to trim marks every edge of [Object]; a Value that reads [$Item] or [$Index] is worked out once per item, such as Object.Faces.Data.Height to [=[$Index] * 0.1], and Object.Faces(0).Edges.Data.Kind only the edges of its first face. The key may come from a variable, such as Object.Data.[Key]. Mode: Set [Object.Mode] or Set [Objects.Modes] to Additive, Subtractive or Intersecting changes its CSG mode in the output. Position: Set [$Selected.Vertices.Positions] or Set [$Vertex.Position] moves those corners; Value is worked out once per corner, with $Vertex and $Index, and every read in the line sees the geometry as it was before the line. All the moves apply together. A solid may be left not convex for now, so later lines can keep moving its corners; only when the script ends does a warning list the solids still not convex, which are not built.',
    stops: [
      'A name that is not letters, digits and _, or starts with a digit.',
      'A [Name] for a variable not set above this line, or a [=formula] that cannot be read.',
      'Setting an input of the script, which can only be read.',
      'Setting a member such as Face.Center or Object.Edges, which can only be read; Vertex.Position, Face.UVs, FaceCorner.UV, Object.Mode and the values under .Data can be set.',
      'An item number past the end of a list, such as Points(5) when Points has 3 items.',
    ],
    parameters: [
      solidScriptParameterWrites(
        solidScriptParameter(
          'name',
          'Variable',
          'target',
          'Width',
          'Letters, digits and _, not starting with a digit. For a list, Points() adds an item and Points(2) changes item 2. Face.Data.Height sets a value under .Data, on every item of a list such as Object.Edges.Data.Kind. Object.Mode or Objects.Modes sets the CSG mode. Vertex.Position, Vertices.Positions or [$Selected.Vertices.Positions] moves those corners.',
        ),
        { rule: 'value', field: 'value', what: 'set to {value}' },
        'path',
      ),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'value',
          'Value',
          'value',
          'A number, numbers separated by commas such as 1, 2, 3, a vector such as [1, 2, 3], a list of any items separated by commas such as [1, 2, 3], zu, 45, plain text ($, for a comma in it), [Name] for another variable, or [=formula] such as [=[Width] * 2]. For a Vertex.Position write, once per corner, such as [=[$Vertex.Position] + [0, 1, 0]]. Left empty it is empty text.',
        ),
        'Vertex',
        { field: 'name', position: true, data: true },
      ),
    ],
    listing: (read) => ['Set', read.value('name'), ': ', read.value('value')],
    execute: (run) => {
      run.variableWrite(run.text('name'), 'value');
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'repeat',
    label: 'Repeat',
    category: 'Logic',
    description: 'Run lines several times',
    manual:
      'Runs the lines inside once for each counter value. The counter starts at From and adds Step each round, stopping before it reaches To: To is not included, so From 0 To 5 runs with 0, 1, 2, 3 and 4, and From 0 To 0 runs no round. The lines inside can read the counter. Example: Repeat [I] From 0 To 5 around Transform Move [=[I] * 2], 0, 0 and a Cube builds five cubes in a row.',
    stops: [
      'A Step of 0, or a Step that walks away from To.',
      `More than ${SOLID_SCRIPT_REPEAT_ROUNDS_MAX} rounds.`,
      'A counter name that is not letters, digits and _.',
      'A missing End line.',
    ],
    nesting: 'open',
    flow: { kind: 'loop' },
    parameters: [
      solidScriptParameterWrites(
        solidScriptParameter(
          'variable',
          'Counter',
          'name',
          'I',
          'Name the lines inside use for the current round, such as I.',
        ),
        { rule: 'kind', kind: 'Number', what: 'counter of **{command}**' },
      ),
      solidScriptParameter('from', 'Start', 'number', '0', 'Counter value of the first round, such as 0.'),
      solidScriptParameter(
        'to',
        'To',
        'number',
        '3',
        'Counter value the rounds stop before, not run itself, such as 10 for 0 to 9.',
      ),
      solidScriptParameter('step', 'Step', 'number', '1', 'Added to the counter after each round, such as 1.'),
    ],
    listing: (read) => [
      'Repeat',
      read.value('variable'),
      ' From ',
      read.value('from'),
      ' To ',
      read.value('to'),
      ' (Exclusive)',
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
      'Runs the lines inside once for each item of a list, with Item holding the current one. The list can be numbers separated by commas, a list variable such as [Points], or geometry such as [$Selected.Faces], [Top.Edges] or [$Input.Objects]; over [Face.Data] it runs once per user value. Key, when given, holds the item number from 0, or the key name over Data. Where, when given, is a 🔁 condition an item must pass, with [$Item] the item, for the lines inside to run for it; Key still counts in the whole list. [$Selected.*] carries from round to round and stays after End, so a later round can add to or move what an earlier round picked. Write a pick Into a variable when you want to keep it through later Select lines. Example: For Each [Face] In [$Selected.Faces], Extrude Face Of [Face] By 0.2, End.',
    stops: [
      `More than ${SOLID_SCRIPT_REPEAT_ROUNDS_MAX} items.`,
      'An Item or Key name that is not letters, digits and _.',
      'A missing End line.',
    ],
    nesting: 'open',
    flow: { kind: 'loop' },
    parameters: [
      solidScriptParameterWrites(
        solidScriptParameter(
          'variable',
          'Item',
          'name',
          'Item',
          'Name the lines inside use for the current item, such as Face.',
        ),
        { rule: 'item', field: 'list', what: 'item of **{command}**' },
      ),
      solidScriptParameter(
        'list',
        'In',
        'value',
        '1, 2, 3',
        'Items separated by commas, or a list such as [Points], [$Selected.Faces] or [Face.Data].',
      ),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'where',
          'Where',
          'value',
          'A condition each item must pass for the lines inside to run for it, such as [=[$Item.Normal.Y] > 0.5]; Key keeps the item number from the whole list. Left off runs for every item.',
        ),
        'Item',
      ),
      solidScriptParameterWrites(
        solidScriptParameterOptional(
          'key',
          'Key',
          'name',
          'Name for the item number from 0, or the key name over Data, such as Index; left off gives none.',
        ),
        { rule: 'key', field: 'list', what: 'key of **{command}**' },
      ),
    ],
    listing: (read) => [
      'For Each',
      read.value('variable'),
      ' In ',
      read.value('list'),
      ...(read.text('key').trim() === '' ? [] : [' Key ', read.value('key')]),
      ...(read.text('where').trim() === '' ? [] : [' Where ', read.value('where')]),
    ],
    execute: (run) => {
      const list = run.list('list');
      const only = list.length === 1 ? list[0] : undefined;
      const entries =
        only instanceof SolidScriptElement && only.kind === 'data' ? run.elements.dataEntries(only) : null;
      const items = entries ? entries.map((entry) => entry.value) : list;
      if (items.length > SOLID_SCRIPT_REPEAT_ROUNDS_MAX)
        throw new Error(
          `For Each would run ${solidScriptLimitCount(items.length)} times, more than ${solidScriptLimitCount(SOLID_SCRIPT_REPEAT_ROUNDS_MAX)}. Give it a shorter list, or split this into smaller generators.`,
        );
      const key = run
        .text('key')
        .trim()
        .replace(/^\[(.*)\]$/s, '$1');
      const keys = entries ? entries.map((entry) => entry.name) : items.map((_, index) => index);
      const kept = solidScriptForEachKept(run, items);
      const keptItems = kept.map((index) => items[index]);
      if (key === '') return run.repeated(run.text('variable'), keptItems);
      return run.repeated(run.text('variable'), keptItems, {
        name: key,
        keys: kept.map((index) => keys[index] ?? index),
      });
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
    flow: { kind: 'choice', condition: 'condition' },
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
        'Plain text, such as Hello or [=[Width]]. [Name] puts in a variable, [=formula] a result, $[ and $] write brackets.',
      ),
    ],
    listing: (read) => ['@ Echo', read.value('value')],
    execute: (run) => run.print(solidScriptValueText(run.value('value'))),
  }),
  new SolidScriptCommand({
    id: 'warn',
    label: 'Warn',
    category: 'Logic',
    description: 'Warn about a problem, or stop the script',
    manual:
      'Adds a warning to the Output and the inspector, the way the editor warns about a solid that is not convex, so whoever uses the generator sees it. Kind Stop ends the script with the message as its mistake instead, like a broken line. Put it inside If to warn only when something is wrong. [Name] and [=formula] are filled in, like in Echo. Example: If [=[Width] > 20], Warn Width above 20 m is too wide for a door.',
    stops: ['Kind Stop, which always stops the script with the message.'],
    parameters: [
      solidScriptParameter(
        'text',
        'Message',
        'message',
        'Check the size',
        'Plain text to show, such as Width [Width] is too wide. [Name] puts in a variable.',
      ),
      solidScriptParameterWords(
        'kind',
        'Kind',
        'text',
        'Warning',
        'Warning keeps going and shows the message; Stop ends the script with it. Type one, such as Stop.',
        [
          { word: 'Warning', detail: 'Show the message and keep going' },
          { word: 'Stop', detail: 'End the script with the message as its mistake' },
        ],
      ),
    ],
    listing: (read) => [
      'Warn',
      read.value('text'),
      ...solidScriptListingOptions([read.changed('kind') && ['Kind ', read.value('kind')]]),
    ],
    execute: (run) => {
      solidScriptWarnRun(run);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'note',
    label: 'Note',
    category: 'Logic',
    description: 'Write a note for people',
    manual:
      'A note for people reading the script, such as what the next lines build. It does nothing when the script runs.',
    parameters: [
      {
        ...solidScriptParameter(
          'text',
          'Text',
          'text',
          '',
          'Any text, such as a short reminder of what the next lines do.',
        ),
        verbatim: true,
      },
    ],
    runs: false,
    listing: (read) => [{ kind: 'note', text: solidScriptListingNote(read.raw('text')) }],
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
    id: 'group',
    label: 'Group',
    category: 'Parts',
    description: 'Wrap shapes in a CSG group',
    manual:
      'Builds the lines inside into a CSG group and places that group here. Mode defaults to Additive: the group is added to the shapes before it. Subtractive cuts the group out of them, Intersecting keeps only the overlap, and Pass-Through acts like a folder whose solids combine as if they were not grouped. A Name on the group becomes the outliner name. Example: Group Mode Subtractive around a door Cube cuts that door out of the wall before it.',
    stops: ['A missing End line.', 'Mode that is not Additive, Subtractive, Intersecting or Pass-Through.'],
    nesting: 'open',
    named: true,
    parameters: [solidScriptParameterGroupMode()],
    endLabel: 'Group',
    listing: (read) => ['Group', ...solidScriptListingOptions([read.changed('mode') && ['Mode ', read.value('mode')]])],
    execute: (run) => run.grouped(),
  }),
  new SolidScriptCommand({
    id: 'part',
    label: 'Define Part',
    category: 'Parts',
    description: 'Build into a variable, without output',
    manual:
      'Builds the lines inside into a variable of the same name, inside a CSG group, and places nothing where the Part stands. Parts and variables share one set of names, so after Define Part Wall the solids are [Wall]. Mode defaults to Additive and can be Subtractive, Intersecting or Pass-Through, the same words as Group. Output stamps a snapshot of the part, including the group and its Mode, right where the Output line sits. Later changes to the part do not reach copies already stamped. Example: Define Part Post holds one tall Cube. [Post] is that cube, and two Output [Post] lines inside two Transforms build two posts.',
    stops: [
      'A name already used by another part.',
      'A name that is not letters, digits and _.',
      'A missing End line.',
      'Mode that is not Additive, Subtractive, Intersecting or Pass-Through.',
    ],
    nesting: 'open',
    flow: { kind: 'part', name: 'name' },
    parameters: [
      {
        ...solidScriptParameterWrites(
          solidScriptParameter(
            'name',
            'Name',
            'name',
            'Part',
            'The name of the part and of the variable it builds into, an Object list, such as Knob. It also names the group.',
          ),
          { rule: 'kind', kind: 'Object List', what: 'the solids of **{command}**' },
          'none',
        ),
        nameGroups: ['Parts'],
      },
      solidScriptParameterGroupMode(),
    ],
    endLabel: 'Part',
    listing: (read) => [
      'Define Part',
      read.value('name'),
      ...solidScriptListingOptions([read.changed('mode') && ['Mode ', read.value('mode')]]),
    ],
    execute: (run) => run.partKeep(),
  }),
  new SolidScriptCommand({
    id: 'return',
    label: 'Return',
    category: 'Parts',
    description: 'Leave the function or part early',
    manual:
      'Stops a Function or a part early. The lines after it are skipped. In a Function, the script goes on after the Call that started it, and Return can give back a value. A Call line stores that value in its Result In variable. In a Part, Return stops building the variable. Solids built before Return stay. Put Return inside an If to stop only sometimes. Example: Return [Local.V] gives back the value V.',
    stops: ['Being outside a Function or a Define Part.', 'A Value inside a part. Parts hand back results with Set.'],
    flow: { kind: 'return', value: 'value' },
    parameters: [
      solidScriptParameterOptional(
        'value',
        'Value',
        'value',
        'The value a Function gives back, such as [Height] * 2. Left off, it gives back nothing.',
      ),
    ],
    listing: (read) => ['Return', ...(read.text('value') === '' ? [] : [read.value('value')])],
    execute: (run) => run.leave(solidScriptRunValueOptional(run, 'value')),
  }),
  new SolidScriptCommand({
    id: 'output',
    label: 'Output',
    category: 'Parts',
    description: 'Stamp a snapshot of a part or objects',
    manual:
      "Places a snapshot of a Part or of objects right where this line sits, including the Part's CSG group and Mode. A wall Part with a subtractive door always comes out as a wall with a hole. To make a cutter that reaches the world, set the Part's Mode to Subtractive, or to Pass-Through to let its solids join the CSG order around it. Blocks around this line move the stamp. Later changes to the Part do not reach copies already stamped. The Part line must have run already. Example: Output [Post] inside Transform Move 2, 0, 0 stamps the post two metres to the right.",
    stops: ['No part or objects with this name.', 'A value that is not a part or an object.', 'Nothing to stamp.'],
    parameters: [
      {
        ...solidScriptParameter(
          'of',
          'Of',
          'value',
          '',
          'The part or objects to stamp, such as [Wall]. A name such as Post also works.',
        ),
        nameGroups: ['Parts', 'Objects'],
        accepts: ['Object', 'Object List', 'Text', 'List'],
      },
    ],
    listing: (read) => ['Output', read.value('of')],
    execute: (run) => run.outputStamp(run.value('of')),
  }),
  new SolidScriptCommand({
    id: 'stop_script',
    label: 'Stop Script',
    category: 'Logic',
    description: 'End the script here, keeping what it built',
    manual:
      'Ends the whole script at this line, also from inside a Repeat, a part or a Function. Solids built before it stay; the lines after it do not run. It is not a mistake, so nothing is highlighted. Example: If [Steps] == 0 around Echo Nothing to build and Stop Script.',
    stops: [],
    parameters: [],
    listing: () => ['Stop Script'],
    execute: (run) => run.stop(),
  }),
];
