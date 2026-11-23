import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterInto,
  solidScriptParameterOptional,
  solidScriptParameterWhen,
  solidScriptParameterWords,
} from './solid_script_command_parameters.js';
import { solidScriptFaceWriteValue } from './solid_script_face_of.js';
import * as THREE from 'three';
import { solidScriptPathStraight, type SolidScriptPath } from '@/solid_script/language/solid_script_path_model.js';
import { solidScriptPathSubdivide } from '@/solid_script/language/solid_script_path_subdivide.js';
import { SOLID_SCRIPT_MESH_POINTS_MAX } from '@/solid_script/language/solid_script_limits.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import {
  SOLID_SCRIPT_PATH_RESOLUTION,
  SOLID_SCRIPT_PATH_TYPES,
  solidScriptPathClosedSet,
  solidScriptPathResolutionSet,
  solidScriptPathHandles,
  solidScriptPathTyped,
  solidScriptPathWithHandles,
} from '@/solid_script/language/solid_script_path_handles.js';
import {
  SOLID_SCRIPT_HANDLE_SIDES,
  SOLID_SCRIPT_HANDLE_TYPES,
  solidScriptHandleTypeMoved,
  solidScriptPathHandleTypes,
  solidScriptPathHandleTypesOf,
  solidScriptPathHandleTypesSet,
  type SolidScriptHandleSide,
  type SolidScriptHandleType,
} from '@/solid_script/language/solid_script_path_handle_types.js';
import { solidScriptNoiseWord } from '@/solid_script/language/solid_script_functions_noise.js';
import { solidScriptConditionHolds } from '@/solid_script/language/solid_script_condition.js';
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
  const types = solidScriptPathHandleTypesOf(source);
  const moved = (key: string, kept: SolidScriptHandleType[]) =>
    run.source(key).trim() === '' ? kept : kept.map(solidScriptHandleTypeMoved);
  solidScriptPathHandlesWrite(run, {
    ...solidScriptPathWithHandles(source, handles, solidScriptPathResolution(run, 'Set Handles')),
    handleTypes: { left: moved('left', [...types.left]), right: moved('right', [...types.right]) },
  });
}

/**
 * Places the handles of the Path's points that pass Pick Where by Type.
 *
 * @param run Running line.
 */
function solidScriptSetHandleTypeRun(run: SolidScriptBlockRun): void {
  const source = solidScriptPathHandlesSource(run, 'Set Handle Type');
  const type: SolidScriptHandleType = solidScriptNoiseWord(
    run.text('type'),
    SOLID_SCRIPT_HANDLE_TYPES,
    'Set Handle Type Type',
  );
  const side: SolidScriptHandleSide = solidScriptNoiseWord(
    run.text('side'),
    SOLID_SCRIPT_HANDLE_SIDES,
    'Set Handle Type Side',
  );
  const picked = source.points.map((point, index) =>
    solidScriptConditionHolds(run, 'pick', {
      $Point: new SolidScriptPoint([...point]),
      $Index: index,
      $Count: source.points.length,
    }),
  );
  const handles = solidScriptPathHandleTypes(source, solidScriptPathHandles(source), type, side, picked);
  solidScriptPathHandlesWrite(run, {
    ...solidScriptPathWithHandles(source, handles, solidScriptPathResolution(run, 'Set Handle Type')),
    handleTypes: solidScriptPathHandleTypesSet(source, type, side, picked),
  });
}

/**
 * Gives the Path's points the tilt in Tilt, in degrees.
 *
 * @param run Running line.
 */
function solidScriptSetTiltRun(run: SolidScriptBlockRun): void {
  const source = solidScriptPathHandlesSource(run, 'Set Tilt');
  const tilts = source.points.map((point, index) => {
    const tilt = solidScriptValueNumber(
      run.valueWith('tilt', { $Point: new SolidScriptPoint([...point]), $Index: index, $Count: source.points.length }),
    );
    if (tilt === undefined) throw new Error('Set Tilt needs a number of degrees per point, such as 45');
    return tilt;
  });
  solidScriptPathHandlesWrite(run, { ...source, tilts });
}

/** How Set Path Normal makes the path's up side face. */
const SOLID_SCRIPT_PATH_NORMAL_MODES = ['Minimum Twist', 'Up', 'Free'] as const;

/**
 * Reads the Free normal of every point of a path: a vector that is not 0, 0, 0,
 * kept as a unit direction.
 *
 * @param run Running line.
 * @param points Path points.
 * @returns Normal per point.
 */
function solidScriptSetPathNormalsRead(run: SolidScriptBlockRun, points: readonly (readonly number[])[]): number[][] {
  return points.map((point, index) => {
    const numbers = solidScriptValueNumbers(
      run.valueWith('normal', { $Point: new SolidScriptPoint([...point]), $Index: index, $Count: points.length }),
    );
    const normal = numbers?.length === 3 ? new THREE.Vector3(numbers[0], numbers[1], numbers[2]) : undefined;
    if (!normal || normal.lengthSq() === 0)
      throw new Error('Set Path Normal needs a direction per point that is not 0, 0, 0, such as 0, 1, 0');
    return normal.normalize().toArray();
  });
}

/**
 * Stores how the Path's up side faces: Minimum Twist drops any stored normal,
 * Up keeps it facing up, and Free stores the Normal of each point.
 *
 * @param run Running line.
 */
function solidScriptSetPathNormalRun(run: SolidScriptBlockRun): void {
  const { normal: _before, ...source } = solidScriptPathHandlesSource(run, 'Set Path Normal');
  const mode = solidScriptNoiseWord(run.text('mode').trim() || 'Minimum Twist', SOLID_SCRIPT_PATH_NORMAL_MODES, 'Mode');
  if (mode === 'Minimum Twist') return solidScriptPathHandlesWrite(run, source);
  if (mode === 'Up') return solidScriptPathHandlesWrite(run, { ...source, normal: { mode } });
  solidScriptPathHandlesWrite(run, {
    ...source,
    normal: { mode, normals: solidScriptSetPathNormalsRead(run, source.points) },
  });
}

/**
 * Reads Subdivide Path's Cuts for each point: rounded, and none below 0.
 *
 * @param run Running line.
 * @param path Path to cut.
 * @returns Cuts in the stretch each point starts.
 */
function solidScriptSubdivideCuts(run: SolidScriptBlockRun, path: SolidScriptPath<number[]>): number[] {
  const cuts = path.points.map((point, index) => {
    const fills = { $Point: new SolidScriptPoint([...point]), $Index: index, $Count: path.points.length };
    const cut = solidScriptValueNumber(run.valueWith('cuts', fills));
    if (cut === undefined) throw new Error('Subdivide Path needs a whole number of Cuts per point, such as 2');
    return Math.max(0, Math.round(cut));
  });
  if (cuts.reduce((sum, cut) => sum + cut, path.points.length) > SOLID_SCRIPT_MESH_POINTS_MAX)
    throw new Error(`Subdivide Path would make more than ${SOLID_SCRIPT_MESH_POINTS_MAX} points; use fewer Cuts`);
  return cuts;
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

/**
 * Set Handles, Set Handle Type, Set Tilt, Set Path Type, Set Path Closed and
 * Subdivide Path.
 */
export const SOLID_SCRIPT_COMMANDS_PATH_HANDLES: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'set_handles',
    edits: true,
    label: 'Set Handles',
    category: 'Paths',
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
    id: 'set_handle_type',
    edits: true,
    label: 'Set Handle Type',
    category: 'Paths',
    description: 'Place path handles automatically, as vectors or in line',
    manual:
      'Writes to Into a copy of a Path whose points that pass the 🔁 Pick Where get handles placed by Type, with every stretch a Bezier curve. Auto places both handles along the way from the point before to the point after, sized to the stretches beside it, for a smooth curve through the points. Vector puts each handle a third of the way to the neighbour on its side, so the stretches stay straight. Align turns the handles into one line through the point, keeping their lengths; with Side Left or Right only that handle turns, to point away from the other. Free keeps the handles. Side picks which handles change. The handles are placed once, when the line runs: move the points later and run Set Handle Type again. Resolution is how many steps each stretch is drawn in. Path is a Path or a list of points for a straight open one. The path keeps the type of every handle; [Path.HandleTypesLeft] and [Path.HandleTypesRight] read them, one word per point, so a later Pick Where can choose points by type. Example: Set Handle Type Path [Rail] Type Auto Into [Rail] rounds a zigzag into a smooth curve.',
    stops: [
      'A Path that is not a Path or a list of at least 2 points.',
      'A Type other than Auto, Vector, Align or Free, or a Side other than Both, Left or Right.',
      'A Resolution that is not a whole number from 1 to 256.',
    ],
    parameters: [
      solidScriptParameterWords(
        'type',
        'Type',
        'text',
        'Auto',
        'Auto, Vector, Align or Free. Type one word, such as Auto.',
        [
          { word: 'Auto', detail: 'Smooth handles from the neighbouring points' },
          { word: 'Vector', detail: 'Handles a third of the way to each neighbour' },
          { word: 'Align', detail: 'Handles in one line through the point' },
          { word: 'Free', detail: 'Handles stay where they are' },
        ],
      ),
      solidScriptParameterWords('side', 'Side', 'text', 'Both', 'Both, Left or Right. Type one word, such as Both.', [
        { word: 'Both', detail: 'Both handles of each point' },
        { word: 'Left', detail: 'The handle each point is reached from' },
        { word: 'Right', detail: 'The handle each point leaves toward' },
      ]),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'pick',
          'Pick Where',
          'value',
          'A condition each point must pass to change, such as [=[$Index] > 0]. Left off changes every point.',
        ),
        'Point',
      ),
      ...solidScriptPathHandleFields(),
    ],
    listing: (read) => [
      'Set Handle Type',
      'Of ',
      read.value('path'),
      ' To ',
      read.value('type'),
      ...solidScriptListingOptions([
        read.changed('side') && ['Side ', read.value('side')],
        read.text('pick').trim() !== '' && ['Pick Where ', read.value('pick')],
      ]),
      ' Into ',
      read.value('into'),
    ],
    execute: (run) => {
      solidScriptSetHandleTypeRun(run);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'set_tilt',
    edits: true,
    label: 'Set Tilt',
    category: 'Paths',
    description: 'Tilt a path about the way it runs at each point',
    manual:
      'Writes to Into a copy of a Path whose points have a Tilt: a 🔁 number of degrees per point, with [$Point] the point and [$Index] its number from 0, such as [=[$Index] * 30]. Sweep Along Path turns the profile by the tilt about the way the path runs there, on top of its Twist, and curved stretches blend from one tilt to the next. Read the tilts back with [Path.Tilts], one per point the path passes. Path is a Path or a list of points for a straight open one. Example: Set Tilt Path [Rail] Tilt [=[$Index] * 45] Into [Rail], then Sweep Along Path [Rail], gives a twisted band.',
    stops: ['A Path that is not a Path or a list of at least 2 points.', 'A Tilt that is not a number.'],
    parameters: [
      solidScriptParameterEach(
        solidScriptParameter('tilt', 'Tilt', 'number', '0', 'Degrees to tilt each point by, such as 45.'),
        'Point',
      ),
      ...solidScriptPathHandleFields().filter((field) => field.key !== 'resolution'),
    ],
    listing: (read) => [
      'Set Tilt',
      'Of ',
      read.value('path'),
      ' Tilt ',
      read.value('tilt'),
      ' Into ',
      read.value('into'),
    ],
    execute: (run) => {
      solidScriptSetTiltRun(run);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'set_path_normal',
    edits: true,
    label: 'Set Path Normal',
    category: 'Paths',
    description: "Store the way a path's up side faces",
    manual:
      "Writes to Into a copy of a Path that keeps the way its up side faces. Mode Minimum Twist (the default) turns it as little as it can along the path, Up keeps it facing up as much as the path allows, and Free gives each point its own 🔁 Normal, with [$Point] the point and [$Index] its number from 0, such as [=[$Point.Normal]]; curved stretches blend from one normal to the next. Sweep Along Path faces its profile's up side this way when its own Up is empty, and the normal turns with the path when it is moved or turned. Read it back with [Path.Normals], one per point the path passes. Path is a Path or a list of points for a straight open one. Example: Set Path Normal Path [Rail] Mode Up Into [Rail], then Sweep Along Path [Rail], keeps a rail's profile upright.",
    stops: [
      'A Path that is not a Path or a list of at least 2 points.',
      'A Mode other than Minimum Twist, Up or Free.',
      'A Free Normal that is not a direction, or is 0, 0, 0.',
    ],
    parameters: [
      solidScriptParameterWords(
        'mode',
        'Mode',
        'text',
        'Minimum Twist',
        'How the up side faces: Minimum Twist, Up or Free. Type one, such as Up.',
        [
          { word: 'Minimum Twist', detail: 'Turn as little as possible along the path' },
          { word: 'Up', detail: 'Keep facing up as much as the path allows' },
          { word: 'Free', detail: 'Give each point its own Normal' },
        ],
      ),
      solidScriptParameterWhen(
        solidScriptParameterEach(
          solidScriptParameter('normal', 'Normal', 'value', '0, 1, 0', 'Way up faces at each point, such as 0, 1, 0.'),
          'Point',
        ),
        'mode',
        ['Free'],
      ),
      ...solidScriptPathHandleFields().filter((field) => field.key !== 'resolution'),
    ],
    listing: (read) => [
      'Set Path Normal',
      'Of ',
      read.value('path'),
      ' Mode ',
      read.value('mode'),
      ...(read.text('mode').trim().toLowerCase() === 'free' ? [' Normal ', read.value('normal')] : []),
      ' Into ',
      read.value('into'),
    ],
    execute: (run) => {
      solidScriptSetPathNormalRun(run);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'set_path_type',
    edits: true,
    label: 'Set Path Type',
    category: 'Paths',
    description: 'Make a path straight or curved between its points',
    manual:
      'Writes to Into a copy of a Path whose stretches run another way between its points. Poly makes every stretch straight and drops its handles. Bezier makes every stretch a Bezier curve, keeping the handles a curved stretch has and giving a straight one handles a third of the way along it, so its shape stays until Set Handles moves them; a Catmull Rom path keeps its shape too. Catmull Rom runs a smooth curve through every point, each open end standing in for its missing neighbour. NURBS runs a smooth cubic curve pulled toward the points: a straight path keeps its points, and an open one still reaches its ends; a curved one keeps its shape, each point and its two handles becoming three points. A NURBS path with fewer than 4 points runs straight through them. Making a Catmull Rom or NURBS path Poly gives back its points. Resolution is how many steps each curved stretch is drawn in. Path is a Path or a list of points for a straight open one. Example: Set Path Type Path [Rail] Type Bezier Into [Rail], then Set Handles bends it.',
    stops: [
      'A Path that is not a Path or a list of at least 2 points.',
      'A Type other than Poly, Bezier, Catmull Rom or NURBS.',
      'A Resolution that is not a whole number from 1 to 256.',
    ],
    parameters: [
      solidScriptParameterWords(
        'type',
        'Type',
        'text',
        'Bezier',
        'Poly, Bezier, Catmull Rom or NURBS. Type one, such as Poly.',
        [
          { word: 'Poly', detail: 'Straight stretches between the points' },
          { word: 'Bezier', detail: 'Curved stretches between handles' },
          { word: 'Catmull Rom', detail: 'A smooth curve through every point' },
          { word: 'NURBS', detail: 'A smooth curve pulled toward the points' },
        ],
      ),
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
      const text = run.text('type').trim();
      const type = SOLID_SCRIPT_PATH_TYPES.find((word) => word === text);
      if (type === undefined)
        throw new Error(`Set Path Type needs Poly, Bezier, Catmull Rom or NURBS in Type, not ${text}`);
      const source = solidScriptPathHandlesSource(run, 'Set Path Type');
      solidScriptPathHandlesWrite(
        run,
        solidScriptPathTyped(source, type, solidScriptPathResolution(run, 'Set Path Type')),
      );
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'set_path_resolution',
    edits: true,
    label: 'Set Path Resolution',
    category: 'Paths',
    description: 'Change the steps used to draw each curved stretch',
    manual:
      'Writes to Into a copy of a Path with every curved stretch drawn in Resolution steps. Its control points, handles, tilts and closing stay the same. A straight path keeps the setting without adding points. Read the setting with [Path.Resolution]. Path is a Path or a list of points for a straight open one. Example: Set Path Resolution Path [Rail] Resolution 24 Into [Rail] draws each curved stretch in 24 steps.',
    stops: [
      'A Path that is not a Path or a list of at least 2 points.',
      'A Resolution that is not a whole number from 1 to 256.',
    ],
    parameters: solidScriptPathHandleFields(),
    listing: (read) => [
      'Set Path Resolution',
      'Of ',
      read.value('path'),
      ' To ',
      read.value('resolution'),
      ' Into ',
      read.value('into'),
    ],
    execute: (run) => {
      solidScriptPathHandlesWrite(
        run,
        solidScriptPathResolutionSet(
          solidScriptPathHandlesSource(run, 'Set Path Resolution'),
          solidScriptPathResolution(run, 'Set Path Resolution'),
        ),
      );
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'set_path_closed',
    edits: true,
    label: 'Set Path Closed',
    category: 'Paths',
    description: 'Join the ends of a path, or open it',
    manual:
      'Writes to Into a copy of a Path that is closed, its last point joined back to its first, or open. Closing a straight path adds a straight stretch; closing a curved one adds a Bezier stretch with handles a third of the way along, for Set Handles to bend. Opening drops the stretch from the last point back to the first. Tilts and the way the path curves stay. Read it back with [Path.Closed]. Path is a Path or a list of points for a straight open one. Example: Set Path Closed Path [Rail] Closed Yes Into [Rail] makes a ring of an open rail.',
    stops: ['A Path that is not a Path or a list of at least 2 points.', 'A Closed that is not Yes or No.'],
    parameters: [
      solidScriptParameter(
        'closed',
        'Closed',
        'boolean',
        'Yes',
        'Yes: join the last point back to the first. No: open the path there. Type Yes or No, such as Yes.',
      ),
      ...solidScriptPathHandleFields().filter((field) => field.key !== 'resolution'),
    ],
    listing: (read) => [
      'Set Path Closed',
      'Of ',
      read.value('path'),
      ' To ',
      read.value('closed'),
      ' Into ',
      read.value('into'),
    ],
    execute: (run) => {
      const closed = run.value('closed');
      if (typeof closed !== 'boolean') throw new Error('Set Path Closed needs Yes or No in Closed');
      solidScriptPathHandlesWrite(
        run,
        solidScriptPathClosedSet(solidScriptPathHandlesSource(run, 'Set Path Closed'), closed),
      );
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'subdivide_path',
    edits: true,
    label: 'Subdivide Path',
    category: 'Paths',
    description: 'Add points evenly inside each stretch of a path',
    manual:
      'Writes to Into a copy of a Path with Cuts new points inside each stretch, evenly along it, so its shape stays: a Bezier stretch is split into Bezier stretches along its curve, a Catmull Rom path gets points on its curve, and a straight stretch or a NURBS path gets points on the line between its points. Cuts is a 🔁 whole number per point, with [$Point] the point and [$Index] its number from 0, and gives the cuts of the stretch that starts there; below 0 counts as none. New points get the tilt between their neighbours. Path is a Path or a list of points for a straight open one. Example: Subdivide Path Path [Rail] Cuts 3 Into [Rail], then Points From Path, puts points evenly along every stretch.',
    stops: [
      'A Path that is not a Path or a list of at least 2 points.',
      'Cuts that are not a number.',
      'Cuts that would make too many points.',
    ],
    parameters: [
      solidScriptParameterEach(
        solidScriptParameter('cuts', 'Cuts', 'count', '1', 'New points inside each stretch, such as 2.'),
        'Point',
      ),
      ...solidScriptPathHandleFields().filter((field) => field.key !== 'resolution'),
    ],
    listing: (read) => [
      'Subdivide Path',
      'Of ',
      read.value('path'),
      ' Cuts ',
      read.value('cuts'),
      ' Into ',
      read.value('into'),
    ],
    execute: (run) => {
      const source = solidScriptPathHandlesSource(run, 'Subdivide Path');
      solidScriptPathHandlesWrite(run, solidScriptPathSubdivide(source, solidScriptSubdivideCuts(run, source)));
      return [];
    },
  }),
];
