import { SolidScriptCommand } from './solid_script_command.js';
import {
  solidScriptParameter,
  solidScriptParameterWhen,
  solidScriptParameterWords,
  solidScriptParameterWrites,
} from './solid_script_command_parameters.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { SOLID_SCRIPT_FUNCTIONS_ROTATION } from '@/solid_script/language/solid_script_functions_rotation.js';
import type { SolidScriptValue } from '@/solid_script/language/solid_script_value.js';

/** How Make Rotation reads its turn. */
const SOLID_SCRIPT_ROTATION_AXIS_ANGLE = 'Axis And Angle';

/**
 * Works out the Rotation of a Make Rotation line: degrees around X, then Y,
 * then Z, or a turn around an axis.
 *
 * @param run Running line.
 * @returns Rotation.
 */
function solidScriptMakeRotation(run: SolidScriptBlockRun): SolidScriptValue {
  const how = run.text('how').trim().toLowerCase();
  if (how === SOLID_SCRIPT_ROTATION_AXIS_ANGLE.toLowerCase())
    return SOLID_SCRIPT_FUNCTIONS_ROTATION.rotation_around([run.value('axis'), run.value('angle')]);
  if (how !== '' && how !== 'x then y then z')
    throw new Error(`How needs X Then Y Then Z or Axis And Angle, not ${run.text('how')}`);
  return SOLID_SCRIPT_FUNCTIONS_ROTATION.rotation(run.fields().vector('degrees', [0, 0, 0]));
}

/** Commands that make Rotation values. */
export const SOLID_SCRIPT_COMMANDS_ROTATION: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'make_rotation',
    label: 'Make Rotation',
    category: 'Transforms',
    description: 'Make a Rotation to turn objects by, around X, Y and Z or around an axis',
    synonyms: ['quaternion', 'turn', 'orientation', 'angle'],
    manual:
      'Writes a Rotation to Into: a whole turn that Rotate By, Rotate To and the Rotate of Transform take as well as three numbers. How X Then Y Then Z turns around X, then Y, then Z by Degrees, the same way an object rotation does. How Axis And Angle turns around the direction Axis, which the normal picker can take from a face, by Angle degrees. Rotations combine and blend without ever locking up the way three angles can: CombineRotations, MixRotation, InvertRotation and ApplyRotation work on them in formulas, and RotationDegrees gives the three numbers back. Example: Make Rotation How Axis And Angle Axis 0, 1, 0 Angle 90 Into [Spin], then Rotate By [Spin] Of [Box] gives the box a quarter turn.',
    stops: ['A How that is not X Then Y Then Z or Axis And Angle.', 'An Axis of 0, 0, 0.'],
    parameters: [
      solidScriptParameterWords(
        'how',
        'How',
        'text',
        'X Then Y Then Z',
        'How the turn is given. Type X Then Y Then Z or Axis And Angle, such as Axis And Angle.',
        [
          { word: 'X Then Y Then Z', detail: 'Degrees around X, then Y, then Z, like an object rotation' },
          { word: SOLID_SCRIPT_ROTATION_AXIS_ANGLE, detail: 'A number of degrees around one direction' },
        ],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'degrees',
          'Degrees',
          'vector3',
          '0, 90, 0',
          'Degrees around X, then Y, then Z, such as 0, 90, 0.',
        ),
        'how',
        ['X Then Y Then Z'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'axis',
          'Axis',
          'vector3',
          '0, 1, 0',
          'The direction to turn around, such as 0, 1, 0 for up.',
        ),
        'how',
        [SOLID_SCRIPT_ROTATION_AXIS_ANGLE],
      ),
      solidScriptParameterWhen(
        solidScriptParameter('angle', 'Angle', 'number', '90', 'How many degrees to turn around Axis, such as 90.'),
        'how',
        [SOLID_SCRIPT_ROTATION_AXIS_ANGLE],
      ),
      {
        ...solidScriptParameterWrites(
          solidScriptParameter('into', 'Into', 'name', 'Spin', 'Variable that gets the Rotation, such as Spin.'),
          { rule: 'kind', kind: 'Rotation', what: 'Rotation of **{command}**' },
        ),
        into: 'label',
      },
    ],
    listing: (read) => [
      'Make Rotation',
      ...(read.text('how').trim().toLowerCase() === SOLID_SCRIPT_ROTATION_AXIS_ANGLE.toLowerCase()
        ? [' Axis ', read.value('axis'), ' Angle ', read.value('angle')]
        : [' ', read.value('degrees'), ' Degrees']),
      ' Into ',
      read.value('into'),
    ],
    execute: (run) => {
      run.variableSet(run.text('into').trim(), solidScriptMakeRotation(run));
      return [];
    },
  }),
];
