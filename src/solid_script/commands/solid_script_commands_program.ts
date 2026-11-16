import { SolidScriptCommand, type SolidScriptCommandParameter } from './solid_script_command.js';
import { solidScriptListingInputs, solidScriptListingOptions } from './solid_script_command_listing.js';
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
  solidScriptParameterOptional('label', 'Label', 'text', 'Caption in the inspector. When empty, the name is shown.'),
  solidScriptParameterOptional('min', 'Minimum', 'text', 'Smallest number allowed. Leave it empty for no limit.'),
  solidScriptParameterOptional('max', 'Maximum', 'text', 'Largest number allowed. Leave it empty for no limit.'),
  solidScriptParameterOptional('choices', 'Choices', 'text', 'Values a choice offers, separated by commas.'),
];

/** The Input command, which the inspector also reads. */
const SOLID_SCRIPT_INPUT_COMMAND = new SolidScriptCommand({
  id: SOLID_SCRIPT_COMMAND_INPUT,
  label: 'Input',
  category: 'Inputs',
  description: 'Add a setting to the inspector',
  manual:
    "Adds a setting to the inspector, like the settings of a built-in generator. Lines read it as a variable, such as [width], but cannot change it. Until someone changes it, it has the Default value. Type picks the control: number, count (whole numbers), switch (Yes or No), text, choice, button, curve or texture. A number or count can have a Minimum and Maximum. A choice lists its Choices. A button runs When Button Pressed. A curve opens the curve editor; read it with curve_at or profile_points, and a number Default is a flat line at that height. A texture picks a library texture by name for a Texture block; an empty Default keeps the generator's texture. Example: Input steps, count, Default 8. Then Repeat [i] from 1 to [steps] builds that many steps.",
  stops: [
    'A Type that is not number, count, switch, text, choice, button, curve or texture.',
    'A value outside Minimum and Maximum, a count with decimals, or a choice that is not listed.',
    'A second Input with the same name, or a name a line above already sets.',
  ],
  parameters: SOLID_SCRIPT_INPUT_PARAMETERS,
  listing: (read) => [
    'Input',
    read.text('name'),
    ' (',
    read.text('type'),
    // A curve's text is long and unreadable; the inspector shows it.
    ...(['button', 'curve'].includes(read.text('type').trim())
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
        value =
          input.type === 'text' || input.type === 'choice' || input.type === 'curve' || input.type === 'texture'
            ? given
            : Number(given);
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
    description: 'Group lines to run from elsewhere',
    manual:
      'Names a group of lines so you can run them from other places. The script skips these lines where they stand. They only run when a Call line, or a formula such as [=area(2, 3)], calls the function. Inputs names the values it takes, such as w, d. Inside the function, read them as [local.w] and [local.d]. Names with local. belong to this one call. Names without it, such as [width], are shared by the whole script. A Return line gives a value back. A function may call itself, but an If must stop it. Example: Function area with inputs w, d holds Return [=[local.w] * [local.d]]. Then Call area with 2, 3 gives 6.',
    stops: [
      'A name another function, or a built-in one, already uses.',
      'A call with more or fewer values than the function has Inputs.',
      `Functions and parts calling each other more than ${SOLID_SCRIPT_PART_DEPTH_MAX} levels deep.`,
      'Building shapes from inside a formula. Use a Call line for that.',
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameter('name', 'Name', 'name', 'area', 'The name Call lines and formulas use, such as area(2, 3).'),
      solidScriptParameterOptional(
        'parameters',
        'Inputs',
        'text',
        'Names of the values it takes, such as w, d. Read them as [local.w].',
      ),
    ],
    listing: (read) => ['Function', read.text('name'), ...solidScriptListingInputs(read.text('parameters'))],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: 'call',
    label: 'Call',
    category: 'Parts',
    description: 'Run a function with values',
    manual:
      'Runs a Function, then goes on with the next line. The blocks around this line move what it builds. Values go to the Inputs of the function, in the same order. Each value may be a number, text, [variable] or [=formula]. Result In names a variable that gets the value the function gives back with Return. The function may be above or below this line. Example: Call area with 2, 3, result in [size]. Now [size] is 6.',
    stops: [
      'No Function with this name.',
      'More or fewer values than the function has Inputs.',
      'A Result In, but the function gives nothing back.',
    ],
    parameters: [
      solidScriptParameter('name', 'Function', 'name', 'area', 'Name of the Function block to run.'),
      solidScriptParameterOptional('values', 'Values', 'text', 'Values for its Inputs, in order, such as [i], 0.2.'),
      solidScriptParameterOptional(
        'result',
        'Result In',
        'target',
        'Variable that gets the value the function gives back.',
      ),
    ],
    listing: (read) => [
      'Call',
      read.text('name'),
      ...(read.text('values').trim() === '' ? [] : [' with ', read.value('values')]),
      ...(read.text('result').trim() === '' ? [] : [', result in ', read.variable('result')]),
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
      'Runs these lines when someone changes the input in the inspector, before the shape is rebuilt. The script skips them where they stand. They cannot build shapes. Use them to check the new value. Set Input can fix it, and Show Message can say why. Read any input as [name]. Example: When Input Changes steps, then If [steps] > 64, Set Input steps to 64 and Show Message At most 64 steps.',
    stops: ['A name that is not an Input of the script.', 'Building a shape.'],
    nesting: 'open',
    parameters: [solidScriptParameter('name', 'Input', 'name', 'width', 'Name of the Input it watches.')],
    endLabel: 'When',
    listing: (read) => ['When Input Changes', read.text('name')],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: SOLID_SCRIPT_HANDLERS.button,
    label: 'When Button Pressed',
    category: 'Inputs',
    description: 'Run lines when a button is pressed',
    manual:
      'Runs these lines when someone presses a button in the inspector. The button comes from an Input with Type button. The script skips these lines where they stand. They cannot build shapes. Use Set Input to change inputs, and Show Message to explain. The shape is then rebuilt. Example: Input reset with Type button, then When Button Pressed reset holds Set Input width to 2.',
    stops: ['A name that is not a button Input of the script.', 'Building a shape.'],
    nesting: 'open',
    parameters: [solidScriptParameter('name', 'Button', 'name', 'reset', 'Name of the button Input.')],
    endLabel: 'When',
    listing: (read) => ['When Button Pressed', read.text('name')],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: 'set_input',
    label: 'Set Input',
    category: 'Inputs',
    description: 'Change an input in the inspector',
    manual:
      'Changes an input in the inspector. It only works inside When Input Changes or When Button Pressed. Lines after it read the new value, and the shape is rebuilt with it. The value must fit the input, such as a whole number for a count. Example: Set Input width to [=max([width], 0.5)] keeps the width at 0.5 metres or more.',
    stops: ['Being placed outside When Input Changes or When Button Pressed.', 'A name that is not an Input.'],
    parameters: [
      solidScriptParameter('name', 'Input', 'name', 'width', 'Name of the Input to change.'),
      solidScriptParameter('value', 'Value', 'value', '1', 'New value: a number, text, [variable] or [=formula].'),
    ],
    listing: (read) => ['Set Input', read.text('name'), ' to ', read.value('value')],
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
      'Shows a message under the inputs in the inspector, until the next change. It only works inside When Input Changes or When Button Pressed. Write plain text. [name] and [=formula] are filled in, like in Echo. Example: Show Message Width is limited to [max_width] m.',
    stops: ['Being placed outside When Input Changes or When Button Pressed.'],
    parameters: [solidScriptParameter('text', 'Message', 'message', 'Checked', 'Text to show, as plain words.')],
    listing: (read) => ['Show Message', read.value('text')],
    execute: (run) => {
      run.notice(solidScriptValueText(run.value('text')));
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'offset',
    label: 'Offset',
    category: '2D Shapes',
    description: 'Grow or shrink flat outlines',
    manual:
      'Moves the edges of the flat outlines between this line and its End outwards by Distance in metres, or inwards when Distance is below 0. Round gives grown corners a curve with Sides points around a full circle. Switched off, corners stay sharp. Growing with Round works on any outline. Sharp corners and shrinking need a convex one for now. Like other outlines, it belongs inside Linear Extrude or Rotate Extrude. Example: Offset 0.1 with Round around a Square 2 gives a slab with soft corners.',
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
        'How far the edges move, in metres. Below 0 shrinks.',
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
