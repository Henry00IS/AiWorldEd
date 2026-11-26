import { solidScriptInputResourceName } from '@/solid_script/language/solid_script_input_resource.js';
import type { SolidScriptValue } from '@/solid_script/language/solid_script_value.js';
import { SolidScriptCommand, type SolidScriptCommandParameter } from './solid_script_command.js';
import { solidScriptListingInputs, solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterDefines,
  solidScriptParameterInto,
  solidScriptParameterOptional,
  solidScriptParameterSides,
  solidScriptParameterWhen,
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
import {
  SOLID_SCRIPT_SHAPE_NAME_KEY,
  solidScriptShapeLeavesPositive,
  type SolidScriptShape,
  solidScriptShapePolygon,
  solidScriptShapePolygonPoints,
} from '@/solid_script/language/solid_script_shape.js';
import {
  SOLID_SCRIPT_HANDLERS,
  SOLID_SCRIPT_PART_DEPTH_MAX,
} from '@/solid_script/language/solid_script_machine_calls.js';
import { solidScriptInputBrushesBuild } from '@/solid_script/language/solid_script_input_brushes.js';
import { solidScriptCurveOrFlat } from '@/solid_script/language/solid_script_curve_of.js';
import { SolidScriptCurveValue } from '@/solid_script/language/solid_script_curve_value.js';
import { solidScriptInputPath } from '@/solid_script/language/solid_script_input_path.js';
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
    `Kind of value: ${SOLID_SCRIPT_INPUT_TYPES.join(', ')}. Type one word, such as Number. The inspector shows a matching control.`,
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
    'Value used until the inspector sets another, as plain text, such as 2, or [0, 0, 0], [2, 0, 0] for a Path. A Curve, Path or Texture can pick one of the script resources, such as [$Resources.Arch].',
  ),
  solidScriptParameterOptional(
    'label',
    'Label',
    'text',
    'Caption in the inspector, such as Wall Height. Left off, the name is shown.',
  ),
  solidScriptParameterOptional(
    'min',
    'Minimum',
    'text',
    'Smallest number allowed, such as 0. Left off, there is no limit.',
  ),
  solidScriptParameterOptional(
    'max',
    'Maximum',
    'text',
    'Largest number allowed, such as 10. Left off, there is no limit.',
  ),
  solidScriptParameterOptional(
    'choices',
    'Choices',
    'text',
    'Values a choice offers, separated by commas, such as Low, Medium, High.',
  ),
  solidScriptParameterWhen(
    solidScriptParameterOptional(
      'follows',
      'Follows',
      'text',
      'Optional: name of a Path object in the scene to follow, such as Room Wall.',
    ),
    'type',
    ['Path'],
  ),
  solidScriptParameterOptional(
    'tooltip',
    'Tooltip',
    'text',
    'Text shown when hovering the input in the inspector, such as Width of the opening in metres.',
  ),
].map((parameter) => (parameter.writes ? parameter : solidScriptParameterDefines(parameter)));

/** The Input command, which the inspector also reads. */
const SOLID_SCRIPT_INPUT_COMMAND = new SolidScriptCommand({
  id: SOLID_SCRIPT_COMMAND_INPUT,
  label: 'Input',
  category: 'Inputs',
  description: 'Add a setting to the inspector',
  manual:
    "Adds a setting to the inspector, like the settings of a built-in generator. Lines read it as a variable, such as [Width], but cannot change it. Until someone changes it, it has the Default value. Type picks the control: Number, Count (whole numbers), Switch (Yes or No), Text, Choice, Button, Curve, Texture, Vector or Path. A Number, Count or Vector can have a Minimum and Maximum; a Vector's apply to each of its x, y and z. A Number or Count with both gets a slider beside its field. A Choice lists its Choices. A Button runs When Button Pressed. A Curve opens the curve editor; read it with curve_at or profile_points, and a Number Default is a flat line at that height. A Texture picks a library texture by name for a Texture block; an empty Default keeps the generator's texture. A Vector shows X, Y and Z fields on one row and gives one value, such as 1, 2, 3 for a Cube of size [Size]. A Path is drawn in the scene: click Edit on the object, Ctrl+Click to add points and drag them; it gives a Path for Sweep Along Path and the other Path lines, and the inspector shows the picked point's position and stretch. A Curve, Path or Texture Default can pick a resource of the script of that kind, such as [$Resources.Arch]; the Default field lists them. Example: Input Steps, Count, Default 8. Then Repeat [I] From 1 To [Steps] builds that many steps.",
  stops: [
    'A Type that is not Number, Count, Switch, Text, Choice, Button, Curve, Texture, Vector or Path.',
    'A value outside Minimum and Maximum, a Count with decimals, a Vector that is not two or three numbers, or a Choice that is not listed.',
    'A second Input with the same name, or a name a line above already sets.',
  ],
  parameters: SOLID_SCRIPT_INPUT_PARAMETERS,
  listing: (read) => {
    const type = read.text('type').trim();
    const defaultText = read.text('default').trim();
    const follows = type === 'Path' ? read.text('follows').trim() : '';
    const hideDefault =
      type === 'Button' ||
      ((type === 'Curve' || type === 'Path') &&
        (defaultText === '' || defaultText === '1' || defaultText.startsWith('{')));
    return [
      'Input',
      read.value('name'),
      ' (',
      read.value('type'),
      ...(hideDefault ? [')'] : [') = ', read.value('default')]),
      ...solidScriptListingOptions([
        follows !== '' && ['Follows ', read.value('follows')],
        read.text('min') !== '' && ['Min ', read.value('min')],
        read.text('max') !== '' && ['Max ', read.value('max')],
        read.text('choices') !== '' && ['Choices ', read.value('choices')],
      ]),
    ];
  },
  execute: (run) => {
    const input = solidScriptInputRead(
      Object.fromEntries(SOLID_SCRIPT_INPUT_PARAMETERS.map((field) => [field.key, run.text(field.key)])),
    );
    const given = run.inputValue(input.name);
    const resource = given === undefined ? solidScriptInputResourceName(input.fallback) : null;
    if (resource !== null) {
      run.inputDefine(input.name, run.resource(resource));
      return [];
    }
    if (input.type === 'Path') {
      run.inputDefine(input.name, solidScriptInputPath(run, given ?? input.fallback));
      return [];
    }
    if (input.type === 'Curve') {
      const text = given ?? input.fallback;
      const curve = solidScriptCurveOrFlat(text);
      run.inputDefine(input.name, curve ? new SolidScriptCurveValue(curve) : text);
      return [];
    }
    let value: SolidScriptValue;
    try {
      value = solidScriptInputValue(input, given ?? input.fallback);
    } catch (error) {
      // An event handler checks whatever was typed, so a bad value reaches it;
      // otherwise a value the script no longer takes falls back to the Default.
      if (given === undefined) throw error;
      if (run.handling)
        value =
          input.type === 'Text' || input.type === 'Choice' || input.type === 'Texture'
            ? given
            : input.type === 'Vector'
              ? given.split(',').map(Number)
              : Number(given);
      else if (input.fallback.trim() !== '') value = solidScriptInputValue(input, input.fallback);
      else throw error;
    }
    run.inputDefine(input.name, value);
    return [];
  },
});

/** Commands for inputs, functions, inspector events, list items and paths. */
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
    parameters: [
      solidScriptParameterDefines(
        solidScriptParameter(
          'title',
          'Title',
          'text',
          'Settings',
          'Heading shown above the inputs inside, such as Size.',
        ),
      ),
    ],
    listing: (read) => ['Input Group', read.value('title')],
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
      'Shows the Input lines between this line and its End in the inspector only while the input named by Input has Value, such as rail settings only while Rails is Yes. Value may list several words separated by commas; any one of them shows the inputs. Yes, True and 1 count as the same, as do No, False and 0. The lines inside still run, so their variables always exist. Example: Input Rails, switch, then Show Inputs When Rails is yes around Input RailHeight.',
    stops: ['A missing End line.'],
    nesting: 'open',
    parameters: [
      solidScriptParameterDefines(
        solidScriptParameter('name', 'Input', 'name', 'Rails', 'Name of the Input it watches, such as Style.'),
        ['Inputs'],
      ),
      solidScriptParameterDefines(
        solidScriptParameter(
          'value',
          'Value',
          'text',
          'yes',
          'Value that shows the inputs inside, as plain text, such as Round.',
        ),
      ),
    ],
    listing: (read) => ['Show Inputs When', read.value('name'), ' Is ', read.value('value')],
    execute: (run) => run.inPlace(),
  }),
  new SolidScriptCommand({
    id: SOLID_SCRIPT_COMMAND_INPUT_NOTE,
    label: 'Input Note',
    category: 'Inputs',
    description: 'Show a line of text among the inputs',
    manual:
      'Shows Text in the inspector among the inputs, where this line stands between the Input lines, such as a hint about units or what a setting does. It builds nothing. Example: Input Note Sizes are in metres above Input Width.',
    parameters: [
      solidScriptParameterDefines(
        solidScriptParameter(
          'text',
          'Text',
          'text',
          'Sizes are in metres.',
          'Text shown in the inspector, such as Set the width before you run the script.',
        ),
      ),
    ],
    runs: false,
    listing: (read) => ['Input Note', read.value('text')],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: 'function',
    label: 'Function',
    category: 'Parts',
    description: 'Group lines to run from elsewhere',
    manual:
      'Names a group of lines so you can run them from other places. The script skips these lines where they stand. They only run when a Call line, or a formula such as [=Area(2, 3)], calls the function. Inputs names the values it takes, such as W, D. Inside the function, read them as [$Local.W] and [$Local.D]. Names with $Local. belong to this one call. Names without it, such as [Width], are shared by the whole script. A Return line gives a value back. A function may call itself, but an If must stop it. Example: Function Area with inputs W, D holds Return [=[$Local.W] * [$Local.D]]. Then Call Area with 2, 3 gives 6.',
    stops: [
      'A name another function, or a built-in one, already uses.',
      'A call with more or fewer values than the function has Inputs.',
      `Functions and parts calling each other more than ${SOLID_SCRIPT_PART_DEPTH_MAX} levels deep.`,
      'Building solids from inside a formula. Use a Call line for that.',
    ],
    nesting: 'open',
    flow: { kind: 'function', name: 'name', inputs: 'parameters' },
    parameters: [
      solidScriptParameterDefines(
        solidScriptParameter(
          'name',
          'Name',
          'name',
          'Area',
          'The name Call lines and formulas use, such as Area(2, 3).',
        ),
      ),
      solidScriptParameterDefines(
        solidScriptParameterOptional(
          'parameters',
          'Inputs',
          'text',
          'Names of the values it takes, such as W, D = 1. Read them as [$Local.W]. An input with = and a value after it may be left off a call and takes that value; those come last.',
        ),
      ),
    ],
    listing: (read) => ['Function', read.value('name'), ...solidScriptListingInputs(read.text('parameters'))],
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
      {
        ...solidScriptParameter(
          'name',
          'Function',
          'name',
          'Area',
          'Name of the Function block to run, such as Staircase.',
        ),
        accepts: ['Text'],
      },
      solidScriptParameterOptional('values', 'Values', 'text', 'Values for its Inputs, in order, such as [I], 0.2.'),
      solidScriptParameterWrites(
        solidScriptParameterOptional(
          'result',
          'Result In',
          'target',
          'Variable that gets the value the function gives back, such as Height.',
        ),
        { rule: 'returned', what: 'returned by {name}()' },
      ),
    ],
    listing: (read) => [
      'Call',
      read.value('name'),
      ...(read.text('values').trim() === '' ? [] : [' With ', read.value('values')]),
      ...(read.text('result').trim() === '' ? [] : [', Result In ', read.value('result')]),
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
      'Runs these lines when someone changes the input in the inspector, before the output is rebuilt. The script skips them where they stand. They cannot build objects. Use them to check the new value. Set Input can fix it, and Show Message can say why. Read any input as [Name]. Example: When Input Changes Steps, then If [Steps] > 64, Set Input Steps to 64 and Show Message At most 64 steps.',
    stops: ['A name that is not an Input of the script.', 'Building an object.'],
    nesting: 'open',
    flow: { kind: 'handler', name: 'name' },
    parameters: [
      solidScriptParameterDefines(
        solidScriptParameter('name', 'Input', 'name', 'Width', 'Name of the Input it watches, such as Style.'),
        ['Inputs'],
      ),
    ],
    endLabel: 'When',
    listing: (read) => ['When Input Changes', read.value('name')],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: SOLID_SCRIPT_HANDLERS.button,
    label: 'When Button Pressed',
    category: 'Inputs',
    description: 'Run lines when a button is pressed',
    manual:
      'Runs these lines when someone presses a button in the inspector. The button comes from an Input with Type Button. The script skips these lines where they stand. They cannot build objects. Use Set Input to change inputs, and Show Message to explain. The solid is then rebuilt. Example: Input Reset with Type Button, then When Button Pressed Reset holds Set Input Width to 2.',
    stops: ['A name that is not a button Input of the script.', 'Building an object.'],
    nesting: 'open',
    flow: { kind: 'handler', name: 'name' },
    parameters: [
      solidScriptParameterDefines(
        solidScriptParameter('name', 'Button', 'name', 'Reset', 'Name of the button Input, such as Build.'),
        ['Inputs'],
      ),
    ],
    endLabel: 'When',
    listing: (read) => ['When Button Pressed', read.value('name')],
    execute: () => [],
  }),
  new SolidScriptCommand({
    id: 'if_used_as',
    label: 'If Used As',
    category: 'Logic',
    description: 'Run lines only as a generator or only as a modifier',
    manual:
      'Runs the lines inside only when the script is used the way Use names: Generator in a generator node, Modifier in the modifier stack of an object or group. An Else starts the lines for the other use. Can Be Used As in the inspector picks the uses a script allows. Script.Usage holds the same word for formulas. Example: If Used As Modifier, a slab under [$Input.Min], Else, a cube and a slab under it.',
    stops: ['A Use that is not Generator or Modifier. Type one word, such as Generator.', 'A missing End line.'],
    nesting: 'open',
    flow: { kind: 'choice' },
    parameters: [
      solidScriptParameterWords(
        'use',
        'Use',
        'text',
        'Modifier',
        'Generator or Modifier. Type one word, such as Generator.',
        [
          { word: 'Generator', detail: 'Placed as a generator node' },
          { word: 'Modifier', detail: 'In the modifier stack of an object or group' },
        ],
      ),
    ],
    listing: (read) => ['If Used As', read.value('use')],
    endLabel: 'If',
    execute: (run) => {
      const use = run.text('use').trim().toLowerCase();
      if (use !== 'generator' && use !== 'modifier') throw new Error('Use must be Generator or Modifier');
      return run.branched(run.use().usage.toLowerCase() === use);
    },
  }),
  new SolidScriptCommand({
    id: 'input_objects',
    label: 'Input Objects',
    category: 'Inputs',
    description: 'Output the solids a modifier receives',
    manual:
      'Outputs every solid the script receives as a modifier. Like a generator, a modifier outputs nothing by itself: without an Input Objects line the received solids are gone and only what the script builds comes out. The solids act like any solid built here: the Transform, Move By, Move To, Rotate By, Rotate To, Scale By, Scale To, Mirror or Matrix lines around this line move them, Repeat makes copies, Mode on a solid cuts or keeps overlap, Select Faces finds their faces, and Clip cuts them, including when Of is [$Input.Objects] above this line. Their faces keep their textures and materials; a cut solid keeps its textures but they are laid out again. To keep textures where they are in the world, or shift the texture of a copy by whole or part tiles, or keep lettering readable on a mirrored copy, write the solids Into a list and use Transform UVs Textures, Offset and Readable Text Of that list. As a generator it outputs nothing. Example: Repeat [I] From 0 To 2 around Transform Move [=[I] * 2], 0, 0 around Input Objects gives the solid and two copies two metres apart.',
    stops: ['An Into name that cannot name a variable, or that is an Input of the script.'],
    parameters: [solidScriptParameterInto('the solids, an Object list', 'Object List', 'what is made', 'copy')],
    listing: (read) => [
      'Input Objects',
      ...solidScriptListingOptions([read.text('into') !== '' && ['Into ', read.value('into')]]),
    ],
    execute: (run) => solidScriptInputBrushesBuild(run),
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
      solidScriptParameterDefines(
        solidScriptParameter('name', 'Input', 'name', 'Width', 'Name of the Input to change, such as Width.'),
        ['Inputs'],
      ),
      solidScriptParameter(
        'value',
        'Value',
        'value',
        '1',
        'New value: a number, text, [Variable] or [=formula], such as 2 or [=[Width] / 2].',
      ),
    ],
    listing: (read) => ['Set Input', read.value('name'), ' To ', read.value('value')],
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
    parameters: [
      solidScriptParameter(
        'text',
        'Message',
        'message',
        'Checked',
        'Text to show, as plain words, such as The door is too narrow.',
      ),
    ],
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
    description: 'Grow or shrink flat paths',
    manual:
      'Moves the edges of the flat paths between this line and its End outwards by Distance in metres, or inwards when Distance is below 0. Round gives grown corners a round edge with Sides points around a full circle. Switched off, corners stay sharp. Growing with Round works on any path. Sharp corners and shrinking need a convex one for now. Like other paths, it belongs inside Linear Extrude or Rotate Extrude. Example: Offset 0.1 with Round around a Square 2 gives a slab with soft corners.',
    stops: [
      'Being outside Linear Extrude or Rotate Extrude.',
      'Shrinking a concave path or growing it with sharp corners, or shrinking a path away completely.',
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameter(
        'distance',
        'Distance',
        'number',
        '0.1',
        'How far the edges move, in metres, such as 0.2. Below 0 shrinks.',
      ),
      solidScriptParameter(
        'round',
        'Round',
        'boolean',
        'Yes',
        'Yes: grown corners are curved. No: they stay sharp. Type Yes or No, such as Yes.',
      ),
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
        throw new Error('Offset grows flat paths, so it belongs inside Linear Extrude or Rotate Extrude');
      const fields = run.fields();
      const options = {
        distance: fields.number('distance', 0.1),
        round: fields.flag('round'),
        sides: solidScriptSides(fields),
      };
      const name = run.text(SOLID_SCRIPT_SHAPE_NAME_KEY).trim();
      const paths: SolidScriptShape[] = run
        .local(true)
        .flatMap(solidScriptShapeLeavesPositive)
        .flatMap((leaf) =>
          leaf.kind === 'polygon'
            ? solidScriptOffset(solidScriptShapePolygonPoints(leaf), options).map((points) =>
                solidScriptShapePolygon(points, name || leaf.label),
              )
            : [],
        );
      return run.placed(paths);
    },
  }),
];
