import type { SolidScriptValue } from '@/solid_script/language/solid_script_value.js';
import * as THREE from 'three';
import { SolidScriptCommand, type SolidScriptCommandParameter } from './solid_script_command.js';
import { solidScriptListingInputs, solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterInto,
  solidScriptParameterOptional,
  solidScriptParameterSides,
  solidScriptParameterWords,
  solidScriptParameterWrites,
} from './solid_script_command_parameters.js';
import {
  SOLID_SCRIPT_COMMAND_INPUT,
  SOLID_SCRIPT_COMMAND_INPUT_GROUP,
  SOLID_SCRIPT_COMMAND_INPUT_NOTE,
  SOLID_SCRIPT_COMMAND_INPUT_ROW,
  SOLID_SCRIPT_COMMAND_SHOW_INPUTS_WHEN,
  SOLID_SCRIPT_INPUT_DEFAULTS,
  SOLID_SCRIPT_INPUT_KINDS,
  SOLID_SCRIPT_INPUT_TYPE_DETAILS,
  SOLID_SCRIPT_INPUT_TYPES,
  solidScriptInputRead,
  solidScriptInputValue,
} from '@/solid_script/language/solid_script_input.js';
import { solidScriptOffset } from '@/solid_script/language/solid_script_offset.js';
import { solidScriptSides } from '@/solid_script/language/solid_script_primitives.js';
import { solidScriptShapeLeavesPositive, type SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';
import {
  SOLID_SCRIPT_HANDLERS,
  SOLID_SCRIPT_PART_DEPTH_MAX,
} from '@/solid_script/language/solid_script_machine_calls.js';
import { solidScriptValueText } from '@/solid_script/language/solid_script_value.js';

/** Fields of an Input line. */
const SOLID_SCRIPT_INPUT_PARAMETERS: readonly SolidScriptCommandParameter[] = [
  solidScriptParameterWrites(
    solidScriptParameter(
      'name',
      'Name',
      'name',
      SOLID_SCRIPT_INPUT_DEFAULTS.name,
      'Variable the lines below read, such as [Width].',
    ),
    { rule: 'word', field: 'type', what: '{type} input' },
    'none',
  ),
  solidScriptParameterWords(
    'type',
    'Type',
    'text',
    SOLID_SCRIPT_INPUT_DEFAULTS.type,
    `Kind of value: ${SOLID_SCRIPT_INPUT_TYPES.join(', ')}. The inspector shows a matching control.`,
    SOLID_SCRIPT_INPUT_TYPES.map((word) => ({
      word,
      detail: SOLID_SCRIPT_INPUT_TYPE_DETAILS[word],
      ...(SOLID_SCRIPT_INPUT_KINDS[word] === undefined ? {} : { gives: SOLID_SCRIPT_INPUT_KINDS[word] }),
    })),
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
  solidScriptParameterOptional('tooltip', 'Tooltip', 'text', 'Text shown when hovering the input in the inspector.'),
];

/** The Input command, which the inspector also reads. */
const SOLID_SCRIPT_INPUT_COMMAND = new SolidScriptCommand({
  id: SOLID_SCRIPT_COMMAND_INPUT,
  label: 'Input',
  category: 'Inputs',
  description: 'Add a setting to the inspector',
  manual:
    "Adds a setting to the inspector, like the settings of a built-in generator. Lines read it as a variable, such as [Width], but cannot change it. Until someone changes it, it has the Default value. Type picks the control: number, count (whole numbers), switch (Yes or No), text, choice, button, curve, texture or vector. A number, count or vector can have a Minimum and Maximum; a vector's apply to each of its x, y and z. A number or count with both gets a slider beside its field. A choice lists its Choices. A button runs When Button Pressed. A curve opens the curve editor; read it with curve_at or profile_points, and a number Default is a flat line at that height. A texture picks a library texture by name for a Texture block; an empty Default keeps the generator's texture. A vector shows X, Y and Z fields on one row and gives one value, such as 1, 2, 3 for a Cube of size [Size]. Example: Input Steps, count, Default 8. Then Repeat [I] from 1 to [Steps] builds that many steps.",
  stops: [
    'A Type that is not number, count, switch, text, choice, button, curve, texture or vector.',
    'A value outside Minimum and Maximum, a count with decimals, a vector that is not three numbers, or a choice that is not listed.',
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
    let value: SolidScriptValue;
    try {
      value = solidScriptInputValue(input, given ?? input.fallback);
    } catch (error) {
      // An event handler checks whatever was typed, so a bad value reaches it;
      // otherwise a value the script no longer takes falls back to the Default.
      if (given === undefined) throw error;
      if (run.handling)
        value =
          input.type === 'text' || input.type === 'choice' || input.type === 'curve' || input.type === 'texture'
            ? given
            : input.type === 'vector'
              ? given.split(',').map(Number)
              : Number(given);
      else if (input.fallback.trim() !== '') value = solidScriptInputValue(input, input.fallback);
      else throw error;
    }
    run.inputDefine(input.name, value);
    return [];
  },
});

/** Commands for inputs, functions, inspector events, list items and outlines. */
export const SOLID_SCRIPT_COMMANDS_PROGRAM: readonly SolidScriptCommand[] = [
  SOLID_SCRIPT_INPUT_COMMAND,
  new SolidScriptCommand({
    id: SOLID_SCRIPT_COMMAND_INPUT_GROUP,
    label: 'Input Group',
    category: 'Inputs',
    description: 'Show inputs under a heading',
    manual:
      'Shows the Input lines between this line and its End under Title in the inspector, so a script with many settings reads like a built-in generator. The lines inside run where they stand, so the variables of its inputs are read after its End as usual. Example: Input Group Railing around Input Rail, switch and Input Height shows both under Railing.',
    stops: ['A missing End line.'],
    nesting: 'open',
    parameters: [solidScriptParameter('title', 'Title', 'text', 'Settings', 'Heading shown above the inputs inside.')],
    listing: (read) => ['Input Group', read.text('title')],
    execute: (run) => run.inPlace(),
  }),
  new SolidScriptCommand({
    id: SOLID_SCRIPT_COMMAND_INPUT_ROW,
    label: 'Input Row',
    category: 'Inputs',
    description: 'Show inputs side by side',
    manual:
      'Shows the Input lines between this line and its End next to each other on one row of the inspector, such as Width, Depth and Height. The lines inside run where they stand, so their variables are read after its End. Example: Input Row around Input Width and Input Depth shows both on one row.',
    stops: ['A missing End line.'],
    nesting: 'open',
    parameters: [],
    listing: () => ['Input Row'],
    execute: (run) => run.inPlace(),
  }),
  new SolidScriptCommand({
    id: SOLID_SCRIPT_COMMAND_SHOW_INPUTS_WHEN,
    label: 'Show Inputs When',
    category: 'Inputs',
    description: 'Show inputs only for a setting',
    manual:
      'Shows the Input lines between this line and its End in the inspector only while the input named by Input has Value, such as rail settings only while Rails is Yes. Yes, True and 1 count as the same, as do No, False and 0. The lines inside still run, so their variables always exist. Example: Input Rails, switch, then Show Inputs When Rails is yes around Input RailHeight.',
    stops: ['A missing End line.'],
    nesting: 'open',
    parameters: [
      {
        ...solidScriptParameter('name', 'Input', 'name', 'Rails', 'Name of the Input it watches.'),
        nameGroups: ['Inputs'],
      },
      solidScriptParameter('value', 'Value', 'text', 'yes', 'Value that shows the inputs inside, as plain text.'),
    ],
    listing: (read) => ['Show Inputs When', read.text('name'), ' is ', read.text('value')],
    execute: (run) => run.inPlace(),
  }),
  new SolidScriptCommand({
    id: SOLID_SCRIPT_COMMAND_INPUT_NOTE,
    label: 'Input Note',
    category: 'Inputs',
    description: 'Show a line of text among the inputs',
    manual:
      'Shows Text in the inspector among the inputs, where this line stands between the Input lines, such as a hint about units or what a setting does. It builds nothing. Example: Input Note Sizes are in metres above Input Width.',
    parameters: [solidScriptParameter('text', 'Text', 'text', 'Sizes are in metres.', 'Text shown in the inspector.')],
    runs: false,
    listing: (read) => ['Input Note', read.text('text')],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: 'function',
    label: 'Function',
    category: 'Parts',
    description: 'Group lines to run from elsewhere',
    manual:
      'Names a group of lines so you can run them from other places. The script skips these lines where they stand. They only run when a Call line, or a formula such as [=Area(2, 3)], calls the function. Inputs names the values it takes, such as W, D. Inside the function, read them as [Local.W] and [Local.D]. Names with Local. belong to this one call. Names without it, such as [Width], are shared by the whole script. A Return line gives a value back. A function may call itself, but an If must stop it. Example: Function Area with inputs W, D holds Return [=[Local.W] * [Local.D]]. Then Call Area with 2, 3 gives 6.',
    stops: [
      'A name another function, or a built-in one, already uses.',
      'A call with more or fewer values than the function has Inputs.',
      `Functions and parts calling each other more than ${SOLID_SCRIPT_PART_DEPTH_MAX} levels deep.`,
      'Building brushes from inside a formula. Use a Call line for that.',
    ],
    nesting: 'open',
    flow: { kind: 'function', name: 'name', inputs: 'parameters' },
    parameters: [
      solidScriptParameter('name', 'Name', 'name', 'Area', 'The name Call lines and formulas use, such as Area(2, 3).'),
      solidScriptParameterOptional(
        'parameters',
        'Inputs',
        'text',
        'Names of the values it takes, such as W, D. Read them as [Local.W].',
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
      'Runs a Function, then goes on with the next line. The blocks around this line move what it builds. Values go to the Inputs of the function, in the same order. Each value may be a number, text, [Variable] or [=formula]. Result In names a variable that gets the value the function gives back with Return. The function may be above or below this line. Example: Call Area with 2, 3, result in [Size]. Now [Size] is 6.',
    stops: [
      'No Function with this name.',
      'More or fewer values than the function has Inputs.',
      'A Result In, but the function gives nothing back.',
    ],
    flow: { kind: 'call', name: 'name', values: 'values' },
    parameters: [
      solidScriptParameter('name', 'Function', 'name', 'Area', 'Name of the Function block to run.'),
      solidScriptParameterOptional('values', 'Values', 'text', 'Values for its Inputs, in order, such as [I], 0.2.'),
      solidScriptParameterWrites(
        solidScriptParameterOptional(
          'result',
          'Result In',
          'target',
          'Variable that gets the value the function gives back.',
        ),
        { rule: 'returned', what: 'returned by {name}()' },
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
      'Runs these lines when someone changes the input in the inspector, before the output is rebuilt. The script skips them where they stand. They cannot build brushes. Use them to check the new value. Set Input can fix it, and Show Message can say why. Read any input as [Name]. Example: When Input Changes Steps, then If [Steps] > 64, Set Input Steps to 64 and Show Message At most 64 steps.',
    stops: ['A name that is not an Input of the script.', 'Building a brush.'],
    nesting: 'open',
    flow: { kind: 'handler', name: 'name' },
    parameters: [solidScriptParameter('name', 'Input', 'name', 'Width', 'Name of the Input it watches.')],
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
      'Runs these lines when someone presses a button in the inspector. The button comes from an Input with Type button. The script skips these lines where they stand. They cannot build brushes. Use Set Input to change inputs, and Show Message to explain. The brush is then rebuilt. Example: Input Reset with Type button, then When Button Pressed Reset holds Set Input Width to 2.',
    stops: ['A name that is not a button Input of the script.', 'Building a brush.'],
    nesting: 'open',
    flow: { kind: 'handler', name: 'name' },
    parameters: [solidScriptParameter('name', 'Button', 'name', 'Reset', 'Name of the button Input.')],
    endLabel: 'When',
    listing: (read) => ['When Button Pressed', read.text('name')],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: SOLID_SCRIPT_HANDLERS.bake,
    label: 'When Baked',
    category: 'Inputs',
    description: 'Change inputs just before a bake',
    manual:
      'Runs these lines when the generator is baked into plain brushes, just before they are made. The script skips them where they stand. They cannot build brushes. Set Input changes inputs for the bake only, so a script can show a light preview while you edit and bake a detailed version. Undoing the bake brings back the generator with its old inputs. Example: When Baked holds Set Input Sides to 32, so the editor shows 8 sides and the baked brushes have 32.',
    stops: ['Building a brush.'],
    nesting: 'open',
    flow: { kind: 'handler' },
    parameters: [],
    endLabel: 'When',
    listing: () => ['When Baked'],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: 'if_used_as',
    label: 'If Used As',
    category: 'Logic',
    description: 'Run lines only as a generator or only as a modifier',
    manual:
      'Runs the lines inside only when the script is used the way Use names: Generator in a generator node, Modifier in the modifier stack of a brush, mesh or group. An Else starts the lines for the other use. Can Be Used As in the inspector picks the uses a script allows. Script.Usage holds the same word for formulas. Example: If Used As Modifier, a slab under [$Input.Min], Else, a cube and a slab under it.',
    stops: ['A Use that is not Generator or Modifier.', 'A missing End line.'],
    nesting: 'open',
    flow: { kind: 'choice' },
    parameters: [
      solidScriptParameterWords('use', 'Use', 'text', 'Modifier', 'Generator or Modifier.', [
        { word: 'Generator', detail: 'Placed as a generator node' },
        { word: 'Modifier', detail: 'In the modifier stack of a brush, mesh or group' },
      ]),
    ],
    listing: (read) => ['If Used As', read.text('use')],
    endLabel: 'If',
    execute: (run) => {
      const use = run.text('use').trim().toLowerCase();
      if (use !== 'generator' && use !== 'modifier') throw new Error('Use must be Generator or Modifier');
      return run.branched(run.use().usage.toLowerCase() === use);
    },
  }),
  new SolidScriptCommand({
    id: 'input_brushes',
    label: 'Input Brushes',
    category: 'Inputs',
    description: 'Output the brushes a modifier receives',
    manual:
      'Outputs every brush the script receives as a modifier. Like a generator, a modifier outputs nothing by itself: without an Input Brushes line the received brushes are gone and only what the script builds comes out. The brushes act like any brush built here: the Translate, Rotate, Scale, Mirror or Matrix blocks around this line move them, Repeat makes copies, Union, Difference and Intersection cut them, and Select Faces finds their faces. Their faces keep their textures and materials. Textures is Move With Shape, so textures stay on their faces, or World Aligned, so they stay where they are in the world; a cut brush keeps its textures but they are laid out again. As a generator it outputs nothing. Example: Repeat [I] from 0 to 2 around Translate by [=[I] * 2], 0, 0 around Input Brushes gives the brush and two copies two metres apart.',
    stops: ['Textures other than Move With Shape or World Aligned.'],
    parameters: [
      solidScriptParameterWords(
        'textures',
        'Textures',
        'message',
        'Move With Shape',
        'Move With Shape keeps textures on their faces; World Aligned keeps them where they are in the world.',
        [
          { word: 'Move With Shape', detail: 'Textures stay on their faces' },
          { word: 'World Aligned', detail: 'Textures stay where they are in the world' },
        ],
      ),
      solidScriptParameterInto('the brushes, a Brush list', 'Brush List', 'what is made'),
    ],
    listing: (read) => [
      'Input Brushes',
      ' textures ',
      read.text('textures'),
      ...(read.text('into') === '' ? [] : [' Into ', read.variable('into')]),
    ],
    execute: (run) => {
      const textures = solidScriptValueText(run.value('textures')).trim().toLowerCase();
      if (textures !== 'move with shape' && textures !== 'world aligned')
        throw new Error(`Textures must be Move With Shape or World Aligned, not "${textures}"`);
      const matrix = run.matrix();
      const turn = new THREE.Matrix3().getNormalMatrix(matrix);
      const use = run.use();
      const built: SolidScriptShape[] = use.solids.flatMap((corners, index): SolidScriptShape[] => {
        // Cut brushes are built again, so their faces take the received textures.
        const faceTextures = use.textures?.[index]?.map((face) => ({
          point: new THREE.Vector3(...face.point).applyMatrix4(matrix),
          normal: new THREE.Vector3(...face.normal).applyMatrix3(turn).normalize(),
          texture: face.texture,
        }));
        return run.solid(corners.map(([x, y, z]) => new THREE.Vector3(x, y, z))).map((shape) =>
          shape.kind === 'solid'
            ? {
                ...shape,
                ...(faceTextures ? { faceTextures } : {}),
                received: { index, matrix, textures: textures === 'world aligned' ? 'world' : 'copied' },
              }
            : shape,
        );
      });
      run.inputsBuilt(built);
      const into = run.text('into').trim();
      if (into !== '')
        run.variableSet(
          into,
          built.flatMap((shape) => (shape.kind === 'solid' ? [run.elements.brush(shape)] : [])),
        );
      return built;
    },
  }),
  new SolidScriptCommand({
    id: 'set_input',
    label: 'Set Input',
    category: 'Inputs',
    description: 'Change an input in the inspector',
    manual:
      'Changes an input in the inspector. It only works inside When Input Changes or When Button Pressed. Lines after it read the new value, and the output is rebuilt with it. The value must fit the input, such as a whole number for a count. Example: Set Input Width to [=Max([Width], 0.5)] keeps the width at 0.5 metres or more.',
    stops: ['Being placed outside When Input Changes or When Button Pressed.', 'A name that is not an Input.'],
    parameters: [
      solidScriptParameter('name', 'Input', 'name', 'Width', 'Name of the Input to change.'),
      solidScriptParameter('value', 'Value', 'value', '1', 'New value: a number, text, [Variable] or [=formula].'),
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
      'Shows a message under the inputs in the inspector, until the next change. It only works inside When Input Changes or When Button Pressed. Write plain text. [Name] and [=formula] are filled in, like in Echo. Example: Show Message Width is limited to [Max_width] m.',
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
    parameters: [
      solidScriptParameter(
        'distance',
        'Distance',
        'number',
        '0.1',
        'How far the edges move, in metres. Below 0 shrinks.',
      ),
      solidScriptParameter('round', 'Round', 'boolean', 'Yes', 'Yes: grown corners are curved. No: they stay sharp.'),
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
