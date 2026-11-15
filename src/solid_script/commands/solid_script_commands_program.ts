import { SolidScriptCommand, type SolidScriptCommandParameter } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterOptional,
  solidScriptParameterSides,
} from './solid_script_command_parameters.js';
import {
  SOLID_SCRIPT_COMMAND_INPUT,
  SOLID_SCRIPT_INPUT_DEFAULTS,
  SOLID_SCRIPT_INPUT_TYPES,
  solidScriptInputRead,
  solidScriptInputValue,
} from '@/solid_script/language/solid_script_input.js';
import { solidScriptOffset } from '@/solid_script/language/solid_script_offset.js';
import { solidScriptSides } from '@/solid_script/language/solid_script_primitives.js';
import { solidScriptShapeLeavesPositive, type SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';
import { SOLID_SCRIPT_PART_DEPTH_MAX } from '@/solid_script/language/solid_script_machine.js';
import { solidScriptValueText } from '@/solid_script/language/solid_script_value.js';

/** Fields of an Input line. */
const SOLID_SCRIPT_INPUT_PARAMETERS: readonly SolidScriptCommandParameter[] = [
  solidScriptParameter(
    'name',
    'Name',
    'name',
    SOLID_SCRIPT_INPUT_DEFAULTS.name,
    'Variable the lines below read, such as [width].',
  ),
  solidScriptParameter(
    'type',
    'Type',
    'text',
    SOLID_SCRIPT_INPUT_DEFAULTS.type,
    `Kind of value: ${SOLID_SCRIPT_INPUT_TYPES.join(', ')}. The inspector shows a matching control.`,
  ),
  solidScriptParameter(
    'default',
    'Default',
    'text',
    '1',
    'Value used until the inspector sets another, as plain text.',
  ),
  solidScriptParameterOptional('label', 'Label', 'text', 'Caption in the inspector; the name when empty.'),
  solidScriptParameterOptional('min', 'Minimum', 'text', 'Smallest number allowed; empty for no limit.'),
  solidScriptParameterOptional('max', 'Maximum', 'text', 'Largest number allowed; empty for no limit.'),
  solidScriptParameterOptional('choices', 'Choices', 'text', 'Values a choice offers, separated by commas.'),
];

/** The Input command, which the inspector also reads. */
const SOLID_SCRIPT_INPUT_COMMAND = new SolidScriptCommand({
  id: SOLID_SCRIPT_COMMAND_INPUT,
  label: 'Input',
  category: 'Inputs',
  description: 'Add a setting to the inspector',
  manual:
    'Makes a variable whose value comes from the inspector of the generator holding the script, like the settings of a built-in generator. Until someone changes it there, it has the Default value. Lines may read it, such as [width], but not set it. Type chooses the control: number and count (whole numbers) with an optional Minimum and Maximum, switch (Yes or No), text, or choice with its Choices. Example: Input steps, count, Default 8, Minimum 1, Maximum 64, then Repeat i from 1 to [steps] builds as many steps as the inspector says.',
  stops: [
    'A Type that is not number, count, switch, text or choice.',
    'A value outside Minimum and Maximum, a count with decimals, or a choice that is not listed.',
    'A second Input with the same name, or a name already set by a line above.',
  ],
  parameters: SOLID_SCRIPT_INPUT_PARAMETERS,
  listing: (read) => [
    '> Input',
    read.text('name'),
    ' (',
    read.text('type'),
    ') = ',
    { kind: 'value', text: read.text('default') },
    ...solidScriptListingOptions([
      read.text('min') !== '' && ['Min ', read.text('min')],
      read.text('max') !== '' && ['Max ', read.text('max')],
      read.text('choices') !== '' && ['Choices ', read.text('choices')],
    ]),
  ],
  execute: (run) => {
    const input = solidScriptInputRead(
      Object.fromEntries(SOLID_SCRIPT_INPUT_PARAMETERS.map((field) => [field.key, run.text(field.key)])),
    );
    const given = run.inputValue(input.name);
    run.inputDefine(input.name, solidScriptInputValue(input, given ?? input.fallback));
    return [];
  },
});

/** Commands for inputs, functions, events, list items and outlines. */
export const SOLID_SCRIPT_COMMANDS_PROGRAM: readonly SolidScriptCommand[] = [
  SOLID_SCRIPT_INPUT_COMMAND,
  new SolidScriptCommand({
    id: 'function',
    label: 'Define Function',
    category: 'Parts',
    description: 'Name a formula to use in other formulas',
    manual:
      'Defines a function that formulas anywhere in the script can use, like the built-in sin() or max(). Inputs lists the names of the values it takes, separated by commas; inside Result, write them as [name], like variables. Result is a formula without the leading =. The function also sees the variables set at the top of the script, and may use itself, as long as a ? : stops it. Example: Define Function area with Inputs w, d and Result [w] * [d], then [=area(2, 3)] gives 6.',
    stops: [
      'A name already used by another function or by a built-in one.',
      'Calling it with more or fewer values than it has Inputs.',
      `Functions used inside each other more than ${SOLID_SCRIPT_PART_DEPTH_MAX} deep.`,
    ],
    parameters: [
      solidScriptParameter('name', 'Name', 'name', 'area', 'Name formulas call it by, such as area(2, 3).'),
      solidScriptParameterOptional('parameters', 'Inputs', 'text', 'Names of the values it takes, such as w, d.'),
      solidScriptParameter(
        'result',
        'Result',
        'text',
        '[w] * [d]',
        'Formula without the leading =, using the inputs as [name].',
      ),
    ],
    listing: (read) => [
      'fn',
      `${read.text('name')}(${read.text('parameters')})`,
      ' = ',
      { kind: 'value', text: read.text('result') },
    ],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: 'event',
    label: 'When Event',
    category: 'Parts',
    description: 'Run lines when an event happens',
    manual:
      'Runs the lines between this line and its End whenever the event with this name happens, then carries on where it happened. They do nothing where they stand. The event start happens before the other lines of the script, and finish after them; Raise Event makes any other event happen, and every When Event of that name runs, in line order. They work like lines written where the event happens, so Set inside changes or makes variables there. Example: When Event finish with Echo Built [count] steps reports a total after the script ran.',
    stops: [
      'A name that is not letters, digits and _.',
      `Events and parts used inside each other more than ${SOLID_SCRIPT_PART_DEPTH_MAX} deep.`,
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameter('name', 'Event', 'name', 'start', 'Event name: start, finish, or a name Raise Event uses.'),
    ],
    listing: (read) => ['On', read.text('name')],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: 'raise_event',
    label: 'Raise Event',
    category: 'Parts',
    description: 'Run the When Event lines of a name',
    manual:
      'Makes an event happen here: every When Event block with this name runs, in line order, moved by the blocks around this line, and the script then carries on with the next line. Nothing happens when no block waits for the event. The name may be a variable, such as [next]. Example: Raise Event decorate inside a Repeat lets every When Event decorate add its own detail to each round.',
    stops: ['A name that is not letters, digits and _.'],
    parameters: [
      solidScriptParameter('name', 'Event', 'message', 'decorate', 'Event name, or a variable that holds one.'),
    ],
    listing: (read) => ['Raise', read.value('name')],
    execute: (run) => run.eventRaise(solidScriptValueText(run.value('name'))),
  }),
  new SolidScriptCommand({
    id: 'remove_item',
    label: 'Remove Item',
    category: 'Logic',
    description: 'Take an item out of a list',
    manual:
      'Removes one item from a list variable: points(2) removes item 2, and the items after it move up by one; points() removes the last item. Items are numbered from 0. Example: after Set points() three times, Remove Item points(0) leaves the second and third point.',
    stops: [
      'A variable that is not a list, an empty list, or an item past the end.',
      'An input, which can only be read.',
    ],
    parameters: [
      solidScriptParameter(
        'target',
        'Item',
        'target',
        'points()',
        'List item to remove, such as points(2), or points() for the last.',
      ),
    ],
    listing: (read) => ['Remove', read.variable('target')],
    execute: (run) => {
      run.itemRemove(run.text('target'));
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'offset',
    label: 'Offset',
    category: '2D Shapes',
    description: 'Grow or shrink flat outlines',
    manual:
      'Moves the edges of the flat outlines between this line and its End outwards by Distance in metres, or inwards when Distance is below 0. Round gives grown corners a curve with Sides points around a full circle; switched off, corners stay sharp. Growing with Round works on any outline; sharp corners and shrinking need a convex one for now. Like other outlines, it belongs inside Linear Extrude or Rotate Extrude. Example: Offset 0.1 with Round around a Square 2 gives a slab with soft corners.',
    stops: [
      'Being outside Linear Extrude or Rotate Extrude.',
      'Shrinking a concave outline or growing it with sharp corners, or shrinking an outline away completely.',
    ],
    nesting: 'open',
    starter: [{ command: 'square', values: {} }],
    parameters: [
      solidScriptParameter(
        'distance',
        'Distance',
        'number',
        '0.1',
        'How far the edges move, in metres; below 0 shrinks.',
      ),
      solidScriptParameter('round', 'Round', 'boolean', 'true', 'Yes: grown corners are curved. No: they stay sharp.'),
      solidScriptParameterSides(),
    ],
    listing: (read) => [
      'Offset',
      read.value('distance'),
      ...solidScriptListingOptions([
        !read.on('round') && ['Sharp'],
        read.changed('sides') && ['Sides ', read.value('sides')],
      ]),
    ],
    execute: (run) => {
      if (!run.planar)
        throw new Error('Offset grows flat outlines, so it belongs inside Linear Extrude or Rotate Extrude');
      const fields = run.fields();
      const options = {
        distance: fields.number('distance', 0.1),
        round: fields.flag('round'),
        sides: solidScriptSides(fields),
      };
      const outlines: SolidScriptShape[] = run
        .local(true)
        .flatMap(solidScriptShapeLeavesPositive)
        .flatMap((leaf) => (leaf.kind === 'polygon' ? solidScriptOffset(leaf.points, options) : []))
        .map((points) => ({ kind: 'polygon', label: 'Offset', points }));
      return run.placed(outlines);
    },
  }),
];
