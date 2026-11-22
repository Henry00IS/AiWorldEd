import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterInto,
  solidScriptParameterOptional,
  solidScriptParameterWords,
} from './solid_script_command_parameters.js';
import { solidScriptFaceWriteValue } from './solid_script_face_of.js';
import * as THREE from 'three';
import { solidScriptPathStraight, type SolidScriptPath } from '@/solid_script/language/solid_script_path_model.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import {
  SOLID_SCRIPT_PATH_RESOLUTION,
  solidScriptPathHandles,
  solidScriptPathTyped,
  solidScriptPathWithHandles,
} from '@/solid_script/language/solid_script_path_handles.js';
import {
  SolidScriptPathElement,
  SolidScriptPoint,
  solidScriptValueNumber,
  solidScriptValueNumbers,
} from '@/solid_script/language/solid_script_value.js';

/** Most steps a Bezier stretch is sampled in. */
const SOLID_SCRIPT_PATH_RESOLUTION_MAX = 256;

/**
 * Reads the Path field: a Path, or a list of points for an open straight one.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @returns Path.
 */
function solidScriptPathHandlesSource(run: SolidScriptBlockRun, label: string): SolidScriptPath<number[]> {
  const raw = run.values('path');
  if (raw.length === 1 && raw[0] instanceof SolidScriptPathElement) return raw[0].path;
  const given = run.value('path');
  const points = Array.isArray(given) ? given.map((point) => solidScriptValueNumbers(point)) : [];
  if (points.length < 2 || points.some((point) => point?.length !== 3))
    throw new Error(`${label} needs a Path or a list of points in Path, such as [Rail]`);
  return solidScriptPathStraight(points as number[][], false);
}

/**
 * Writes a changed path to Into as a new Path.
 *
 * @param run Running line.
 * @param path Path.
 */
function solidScriptPathHandlesWrite(run: SolidScriptBlockRun, path: SolidScriptPath<number[]>): void {
  const vectors = path.points.map(([x = 0, y = 0, z = 0]) => new THREE.Vector3(x, y, z));
  const [made] = run.pathsMake([{ points: vectors, closed: path.closed }]);
  if (!made) return;
  made.path = path;
  solidScriptFaceWriteValue(run, 'into', made);
}

/**
 * Reads Resolution: the steps each Bezier stretch is sampled in.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @returns Whole number from 1.
 */
function solidScriptPathResolution(run: SolidScriptBlockRun, label: string): number {
  const steps = solidScriptValueNumber(run.value('resolution'));
  if (steps === undefined || !Number.isInteger(steps) || steps < 1 || steps > SOLID_SCRIPT_PATH_RESOLUTION_MAX)
    throw new Error(
      `${label} needs a whole number from 1 to ${SOLID_SCRIPT_PATH_RESOLUTION_MAX} in Resolution, such as 12`,
    );
  return steps;
}

/**
 * Reads one handle field for every point; empty keeps the handles there.
 *
 * @param run Running line.
 * @param key Left or right.
 * @param points Points of the path.
 * @param kept Handles there now.
 * @returns Handles.
 */
function solidScriptPathHandlesRead(
  run: SolidScriptBlockRun,
  key: string,
  points: readonly number[][],
  kept: readonly number[][],
): number[][] {
  if (run.source(key).trim() === '') return kept.map((handle) => [...handle]);
  return points.map((point, index) => {
    const value = run.valueWith(key, {
      $Point: new SolidScriptPoint([...point]),
      $Index: index,
      $Count: points.length,
    });
    const numbers = solidScriptValueNumbers(value);
    if (numbers?.length !== 3) throw new Error('Set Handles needs three numbers per handle, such as 1, 2, 0');
    return numbers;
  });
}

/**
 * Gives the Path's points the handles in Left and Right.
 *
 * @param run Running line.
 */
function solidScriptSetHandlesRun(run: SolidScriptBlockRun): void {
  const source = solidScriptPathHandlesSource(run, 'Set Handles');
  const kept = solidScriptPathHandles(source);
  const points = source.points.map((point) => [...point]);
  const handles = {
    left: solidScriptPathHandlesRead(run, 'left', points, kept.left),
    right: solidScriptPathHandlesRead(run, 'right', points, kept.right),
  };
  solidScriptPathHandlesWrite(
    run,
    solidScriptPathWithHandles(source, handles, solidScriptPathResolution(run, 'Set Handles')),
  );
}

/**
 * The Path, Resolution and Into fields of both lines.
 *
 * @returns Fields.
 */
function solidScriptPathHandleFields() {
  return [
    solidScriptParameter(
      'path',
      'Path',
      'points3',
      '[0, 0, 0], [4, 0, 0]',
      'The Path, or a list of points, such as [Rail].',
    ),
    solidScriptParameter(
      'resolution',
      'Resolution',
      'count',
      String(SOLID_SCRIPT_PATH_RESOLUTION),
      `Steps each curved stretch is drawn in, 1 to ${SOLID_SCRIPT_PATH_RESOLUTION_MAX}, such as 12.`,
    ),
    {
      ...solidScriptParameterInto('the changed path, a Path', 'Path', 'what is made', 'label'),
      hint: 'Variable to write the changed path to, such as Rail to replace it.',
      optional: false,
      default: 'Path',
    },
  ];
}

/** Set Handles and Set Path Type. */
export const SOLID_SCRIPT_COMMANDS_PATH_HANDLES: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'set_handles',
    edits: true,
    label: 'Set Handles',
    category: 'Meshes',
    description: 'Bend a path with handles at its points',
    manual:
      "Writes to Into a copy of a Path whose points have a Left and a Right handle, with every stretch bent into a Bezier curve: a stretch leaves its start toward that point's Right handle and comes into its end from that point's Left handle. Left and Right are 🔁 positions, with [$Point] the point and [$Index] its number from 0, such as [=[$Point.Position] + Vector(0, 1, 0)]; left off, a field keeps the handles the path has, which on a straight stretch lie a third of the way along it. Resolution is how many steps each stretch is drawn in. Read the handles back with [Path.HandlesLeft] and [Path.HandlesRight]. Path is a Path or a list of points for a straight open one. Example: Path From Points [0, 0, 0], [4, 0, 0] Into [Arch], then Set Handles Path [Arch] Right 1, 2, 0 Left 3, 2, 0 Into [Arch] bends it into an arch.",
    stops: [
      'A Path that is not a Path or a list of at least 2 points.',
      'A handle that is not three numbers.',
      'A Resolution that is not a whole number from 1 to 256.',
    ],
    parameters: [
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'left',
          'Left',
          'vector3',
          'Handle each point is reached from, such as 1, 2, 0. Left off keeps it.',
        ),
        'Point',
      ),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'right',
          'Right',
          'vector3',
          'Handle each point leaves toward, such as 3, 2, 0. Left off keeps it.',
        ),
        'Point',
      ),
      ...solidScriptPathHandleFields(),
    ],
    listing: (read) => [
      'Set Handles',
      'Of ',
      read.value('path'),
      ...solidScriptListingOptions([
        read.text('left').trim() !== '' && ['Left ', read.value('left')],
        read.text('right').trim() !== '' && ['Right ', read.value('right')],
      ]),
      ' Into ',
      read.value('into'),
    ],
    execute: (run) => {
      solidScriptSetHandlesRun(run);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'set_path_type',
    edits: true,
    label: 'Set Path Type',
    category: 'Meshes',
    description: 'Make a path straight or curved between its points',
    manual:
      'Writes to Into a copy of a Path whose stretches run another way between its points. Poly makes every stretch straight and drops its handles. Bezier makes every stretch a Bezier curve, keeping the handles a curved stretch has and giving a straight one handles a third of the way along it, so its shape stays until Set Handles moves them. Resolution is how many steps each curved stretch is drawn in. Path is a Path or a list of points for a straight open one. Example: Set Path Type Path [Rail] Type Bezier Into [Rail], then Set Handles bends it.',
    stops: [
      'A Path that is not a Path or a list of at least 2 points.',
      'A Type other than Poly or Bezier.',
      'A Resolution that is not a whole number from 1 to 256.',
    ],
    parameters: [
      solidScriptParameterWords('type', 'Type', 'text', 'Bezier', 'Poly or Bezier. Type one word, such as Poly.', [
        { word: 'Poly', detail: 'Straight stretches between the points' },
        { word: 'Bezier', detail: 'Curved stretches between handles' },
      ]),
      ...solidScriptPathHandleFields(),
    ],
    listing: (read) => [
      'Set Path Type',
      'Of ',
      read.value('path'),
      ' To ',
      read.value('type'),
      ' Into ',
      read.value('into'),
    ],
    execute: (run) => {
      const type = run.text('type').trim();
      if (type !== 'Poly' && type !== 'Bezier')
        throw new Error(`Set Path Type needs Poly or Bezier in Type, not ${type}`);
      const source = solidScriptPathHandlesSource(run, 'Set Path Type');
      solidScriptPathHandlesWrite(
        run,
        solidScriptPathTyped(source, type, solidScriptPathResolution(run, 'Set Path Type')),
      );
      return [];
    },
  }),
];
