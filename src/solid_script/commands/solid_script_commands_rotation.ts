import { SolidScriptCommand, type SolidScriptCommandParameter } from './solid_script_command.js';
import type { SolidScriptListingPiece, SolidScriptListingValues } from './solid_script_command_listing.js';
import { solidScriptParameter, solidScriptParameterWrites } from './solid_script_command_parameters.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { SOLID_SCRIPT_FUNCTIONS_ROTATION } from '@/solid_script/language/solid_script_functions_rotation.js';
import type { SolidScriptValue } from '@/solid_script/language/solid_script_value.js';

/** Into of a rotation block: the variable that gets the Rotation. */
const SOLID_SCRIPT_ROTATION_INTO = {
  ...solidScriptParameterWrites(
    solidScriptParameter('into', 'Into', 'name', 'Spin', 'Variable that gets the Rotation, such as Spin.'),
    { rule: 'kind', kind: 'Rotation', what: 'Rotation of **{command}**' },
  ),
  into: 'label' as const,
};

/** Text both rotation blocks' manuals end with. */
const SOLID_SCRIPT_ROTATION_MANUAL_END =
  'Rotate By, Rotate To and the Rotate of Transform take a Rotation as well as three numbers. Rotations combine and blend without ever locking up the way three angles can: CombineRotations, MixRotation, InvertRotation and ApplyRotation work on them in formulas, and RotationDegrees gives the three numbers back.';

/** What differs between the two rotation blocks. */
interface SolidScriptRotationSpec {
  id: string;
  label: string;
  description: string;
  manual: string;
  stops: readonly string[];
  fields: readonly SolidScriptCommandParameter[];
  listing: (read: SolidScriptListingValues) => SolidScriptListingPiece[];
  make: (run: SolidScriptBlockRun) => SolidScriptValue;
}

/**
 * Builds one rotation block that writes a Rotation to Into.
 *
 * @param spec Rotation block.
 * @returns Command.
 */
function solidScriptRotationCommand(spec: SolidScriptRotationSpec): SolidScriptCommand {
  return new SolidScriptCommand({
    id: spec.id,
    label: spec.label,
    category: 'Transforms',
    description: spec.description,
    synonyms: ['quaternion', 'turn', 'orientation', 'angle'],
    manual: `${spec.manual} ${SOLID_SCRIPT_ROTATION_MANUAL_END}`,
    stops: spec.stops,
    parameters: [...spec.fields, SOLID_SCRIPT_ROTATION_INTO],
    listing: (read) => [...spec.listing(read), ' Into ', read.value('into')],
    execute: (run) => {
      run.variableSet(run.text('into').trim(), spec.make(run));
      return [];
    },
  });
}

/** Commands that make Rotation values. */
export const SOLID_SCRIPT_COMMANDS_ROTATION: readonly SolidScriptCommand[] = [
  solidScriptRotationCommand({
    id: 'make_rotation',
    label: 'Make Rotation',
    description: 'Make a Rotation to turn objects by, around X, then Y, then Z',
    manual:
      'Writes a Rotation to Into that turns around X, then Y, then Z by Degrees, the same way an object rotation does. Example: Make Rotation 0, 0, 45 Degrees Into [Tilt].',
    stops: ['Degrees that are not x, y, z.'],
    fields: [
      solidScriptParameter(
        'degrees',
        'Degrees',
        'vector3',
        '0, 90, 0',
        'Degrees around X, then Y, then Z, such as 0, 90, 0.',
      ),
    ],
    listing: (read) => ['Make Rotation', ' ', read.value('degrees'), ' Degrees'],
    make: (run) => SOLID_SCRIPT_FUNCTIONS_ROTATION.rotation(run.fields().vector('degrees', [0, 0, 0])),
  }),
  solidScriptRotationCommand({
    id: 'make_rotation_around',
    label: 'Make Rotation Around',
    description: 'Make a Rotation to turn objects by, a number of degrees around one direction',
    manual:
      'Writes a Rotation to Into that turns around the direction Axis, which the normal picker can take from a face, by Angle degrees. Example: Make Rotation Around 0, 1, 0 Angle 90 Into [Spin], then Rotate By [Spin] Of [Box] gives the box a quarter turn.',
    stops: ['An Axis of 0, 0, 0.'],
    fields: [
      solidScriptParameter(
        'axis',
        'Axis',
        'vector3',
        '0, 1, 0',
        'The direction to turn around, such as 0, 1, 0 for up.',
      ),
      solidScriptParameter('angle', 'Angle', 'number', '90', 'How many degrees to turn around Axis, such as 90.'),
    ],
    listing: (read) => ['Make Rotation Around', ' ', read.value('axis'), ' Angle ', read.value('angle')],
    make: (run) => SOLID_SCRIPT_FUNCTIONS_ROTATION.rotation_around([run.value('axis'), run.value('angle')]),
  }),
];
