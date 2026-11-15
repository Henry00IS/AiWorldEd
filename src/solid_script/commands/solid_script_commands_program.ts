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
import { SOLID_SCRIPT_HANDLERS, SOLID_SCRIPT_PART_DEPTH_MAX } from '@/solid_script/language/solid_script_machine.js';
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
    'Makes a variable whose value comes from the inspector of the generator holding the script, like the settings of a built-in generator. Until someone changes it there, it has the Default value. Lines may read it, such as [width], but not set it. Type chooses the control: number and count (whole numbers) with an optional Minimum and Maximum, switch (Yes or No), text, choice with its Choices, or button, which When Button Pressed answers. Example: Input steps, count, Default 8, Minimum 1, Maximum 64, then Repeat i from 1 to [steps] builds as many steps as the inspector says.',
  stops: [
    'A Type that is not number, count, switch, text, choice or button.',
    'A value outside Minimum and Maximum, a count with decimals, or a choice that is not listed.',
    'A second Input with the same name, or a name already set by a line above.',
  ],
  parameters: SOLID_SCRIPT_INPUT_PARAMETERS,
  listing: (read) => [
    '> Input',
    read.text('name'),
    ' (',
    read.text('type'),
    ...(read.text('type').trim() === 'button'
      ? [')']
      : [') = ', { kind: 'value' as const, text: read.text('default') }]),
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
    let value = solidScriptInputValue(input, input.fallback);
    // An event handler checks whatever was typed, so a bad value reaches it.
    if (given !== undefined)
      try {
        value = solidScriptInputValue(input, given);
      } catch (error) {
        if (!run.handling) throw error;
        value = input.type === 'text' || input.type === 'choice' ? given : Number(given);
      }
    run.inputDefine(input.name, value);
    return [];
  },
});

/** Commands for inputs, functions, inspector events, list items and outlines. */
export const SOLID_SCRIPT_COMMANDS_PROGRAM: readonly SolidScriptCommand[] = [
  SOLID_SCRIPT_INPUT_COMMAND,
  new SolidScriptCommand({
    id: 'function',
    label: 'Function',
    category: 'Parts',
    description: 'Name lines to call with values',
    manual:
      "Names the lines between this line and its End as a function. The script skips them where they stand; they run when a Call line or a formula calls the function, and then the script carries on after the call. Inputs lists the names of the values it takes, separated by commas; inside, they are its own variables, written [local.name], and Set local.name makes another one that only this call sees. Plain names such as [width] are the script's variables, shared with every line. Return with a Value hands a result back; for a one-line function, fill in Result instead and leave the block empty. A function may call itself, as long as an If stops it. Example: Function area with Inputs w, d and Result [local.w] * [local.d], then [=area(2, 3)] gives 6.",
    stops: [
      'A name already used by another function or by a built-in one.',
      'Calling it with more or fewer values than it has Inputs.',
      `Functions and parts running inside each other more than ${SOLID_SCRIPT_PART_DEPTH_MAX} deep.`,
      'Building shapes when a formula calls it; use a Call line for that.',
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameter('name', 'Name', 'name', 'area', 'Name Call lines and formulas use, such as area(2, 3).'),
      solidScriptParameterOptional(
        'parameters',
        'Inputs',
        'text',
        'Names of the values it takes, such as w, d; read them as [local.w].',
      ),
      solidScriptParameterOptional(
        'result',
        'Result',
        'text',
        'Formula without the leading =, given back when no Return gives a value.',
      ),
    ],
    listing: (read) => [
      'fn',
      `${read.text('name')}(${read.text('parameters')})`,
      ...(read.text('result') === '' ? [] : [' = ', { kind: 'value' as const, text: read.text('result') }]),
    ],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: 'call',
    label: 'Call',
    category: 'Parts',
    description: 'Run a function with values',
    manual:
      'Runs the lines of a Function block here, moved by the blocks around this line, and then carries on with the next line. Values are passed to its Inputs in order, separated by commas, and each may be a number, text, [variable] or [=formula]. Result In names a variable that gets what the function hands back with Return. The function may be defined before or after this line. Example: Call stair with Values [i], 0.2 builds one step, and Call area with Values 2, 3 and Result In size sets [size] to 6.',
    stops: [
      'No Function with this name.',
      'More or fewer values than the function has Inputs.',
      'A Result In when the function hands nothing back.',
    ],
    parameters: [
      solidScriptParameter('name', 'Function', 'name', 'area', 'Name of the Function block to run.'),
      solidScriptParameterOptional('values', 'Values', 'text', 'Values for its Inputs, in order, such as [i], 0.2.'),
      solidScriptParameterOptional('result', 'Result In', 'target', 'Variable that gets the value it returns.'),
    ],
    listing: (read) => [
      'Call',
      `${read.text('name')}(${read.text('values')})`,
      ...(read.text('result') === '' ? [] : [' -> ', read.text('result')]),
    ],
    execute: (run) => {
      const result = run.text('result').trim();
      return run.call(run.text('name').trim(), run.values('values'), result === '' ? null : result);
    },
  }),
  new SolidScriptCommand({
    id: SOLID_SCRIPT_HANDLERS.input,
    label: 'When Input Changes',
    category: 'Inputs',
    description: 'Check an input when it changes',
    manual:
      'Runs the lines between this line and its End when someone changes this input in the inspector, before the shape is rebuilt. The script skips them where they stand, and they build nothing: they check the new value, change it with Set Input, and explain with Show Message. Every input is readable as [name], with its new value. Example: When Input Changes steps, If [=[steps] > [height] * 8], Set Input steps to [=floor([height] * 8)] and Show Message Too many steps for this height.',
    stops: ['A name that is not an Input of the script.', 'Building a shape.'],
    nesting: 'open',
    parameters: [solidScriptParameter('name', 'Input', 'name', 'width', 'Name of the Input it watches.')],
    listing: (read) => ['When', read.text('name'), ' changes'],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: SOLID_SCRIPT_HANDLERS.button,
    label: 'When Button Pressed',
    category: 'Inputs',
    description: 'Run lines when a button is pressed',
    manual:
      'Runs the lines between this line and its End when someone presses the button of an Input with Type button in the inspector. The script skips them where they stand, and they build nothing: they change inputs with Set Input and explain with Show Message, and the shape is rebuilt with the new values. Example: Input reset, button, then When Button Pressed reset with Set Input width to 2 and Set Input depth to 2.',
    stops: ['A name that is not a button Input of the script.', 'Building a shape.'],
    nesting: 'open',
    parameters: [solidScriptParameter('name', 'Button', 'name', 'reset', 'Name of the button Input.')],
    listing: (read) => ['When', read.text('name'), ' pressed'],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: 'set_input',
    label: 'Set Input',
    category: 'Inputs',
    description: 'Change an input in the inspector',
    manual:
      'Changes the inspector value of an input, inside When Input Changes or When Button Pressed: the lines after it read the new value, and the shape is rebuilt with it. Use it to clamp a value or to set several inputs from one button. The value must suit the input, such as a whole number for a count. Example: Set Input width to [=max([width], 0.5)] keeps the width at half a metre or more.',
    stops: ['Being placed outside When Input Changes or When Button Pressed.', 'A name that is not an Input.'],
    parameters: [
      solidScriptParameter('name', 'Input', 'name', 'width', 'Name of the Input to change.'),
      solidScriptParameter('value', 'Value', 'value', '1', 'New value: a number, text, [variable] or [=formula].'),
    ],
    listing: (read) => ['Set Input', read.text('name'), ' = ', read.value('value')],
    execute: (run) => {
      run.inputSet(run.text('name').trim(), run.value('value'));
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'show_message',
    label: 'Show Message',
    category: 'Inputs',
    description: 'Explain something in the inspector',
    manual:
      'Shows a message under the inputs in the inspector, inside When Input Changes or When Button Pressed, until the next change. Like Echo it is plain text, with [name] and [=formula] filled in. Example: Show Message Width is limited to [max_width] m.',
    stops: ['Being placed outside When Input Changes or When Button Pressed.'],
    parameters: [solidScriptParameter('text', 'Message', 'message', 'Checked', 'Text to show, as plain words.')],
    listing: (read) => ['Message', read.value('text')],
    execute: (run) => {
      run.notice(solidScriptValueText(run.value('text')));
      return [];
    },
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
