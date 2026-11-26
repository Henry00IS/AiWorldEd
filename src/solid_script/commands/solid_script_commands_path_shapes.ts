import * as THREE from 'three';
import { SolidScriptCommand, type SolidScriptCommandParameter } from './solid_script_command.js';
import {
  solidScriptListingOptions,
  type SolidScriptListingPiece,
  type SolidScriptListingValues,
} from './solid_script_command_listing.js';
import { solidScriptParameter, solidScriptParameterInto } from './solid_script_command_parameters.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import {
  SOLID_SCRIPT_PATH_CORNER_SIDES_MAX,
  SOLID_SCRIPT_PATH_CORNER_SIDES_MIN,
  SOLID_SCRIPT_PATH_COUNT_MAX,
  SOLID_SCRIPT_PATH_COUNT_MIN,
  solidScriptPathArc,
  solidScriptPathLine,
  solidScriptPathRound,
  solidScriptPathSpiral,
} from '@/solid_script/language/solid_script_path_shape.js';
import { solidScriptPathBezier, solidScriptPathSmooth } from '@/solid_script/language/solid_script_path_curves.js';
import { SolidScriptPoint, solidScriptValueNumber } from '@/solid_script/language/solid_script_value.js';
import { solidScriptVectorThreeRequire } from '@/solid_script/language/solid_script_vector.js';

/**
 * Reads a vector field.
 *
 * @param run Running line.
 * @param key Field key.
 * @param label Field caption.
 * @returns Vector.
 */
function solidScriptPathFieldVector(run: SolidScriptBlockRun, key: string, label: string): THREE.Vector3 {
  return solidScriptVectorThreeRequire(run.value(key), `${label} needs a vector as x, y, z, such as 0, 1, 0`);
}

/**
 * Reads a number field.
 *
 * @param run Running line.
 * @param key Field key.
 * @param label Field caption.
 * @returns Number.
 */
function solidScriptPathFieldNumber(run: SolidScriptBlockRun, key: string, label: string): number {
  const value = solidScriptValueNumber(run.value(key));
  if (value === undefined || !Number.isFinite(value)) throw new Error(`${label} needs a number, such as 1`);
  return value;
}

/**
 * Reads Count: how many points a path block writes.
 *
 * @param run Running line.
 * @returns Count.
 */
function solidScriptPathCount(run: SolidScriptBlockRun): number {
  return solidScriptPathFieldNumber(run, 'count', 'Count');
}

/**
 * Builds a Quadratic Path: the Bezier curve with handles two thirds of the way
 * from each end to Middle, which runs the same.
 *
 * @param run Running line.
 * @returns Points.
 */
function solidScriptPathBuildQuadratic(run: SolidScriptBlockRun): THREE.Vector3[] {
  const from = solidScriptPathFieldVector(run, 'from', 'From');
  const middle = solidScriptPathFieldVector(run, 'middle', 'Middle');
  const to = solidScriptPathFieldVector(run, 'to', 'To');
  const pull = (end: THREE.Vector3) => end.clone().lerp(middle, 2 / 3);
  return solidScriptPathBezier(from, pull(from), pull(to), to, solidScriptPathCount(run), 'Path');
}

/**
 * Builds a Bezier Path.
 *
 * @param run Running line.
 * @returns Points.
 */
function solidScriptPathBuildBezier(run: SolidScriptBlockRun): THREE.Vector3[] {
  return solidScriptPathBezier(
    solidScriptPathFieldVector(run, 'from', 'From'),
    solidScriptPathFieldVector(run, 'from_handle', 'From Handle'),
    solidScriptPathFieldVector(run, 'to_handle', 'To Handle'),
    solidScriptPathFieldVector(run, 'to', 'To'),
    solidScriptPathCount(run),
    'Path',
  );
}

/**
 * Builds an Arc Path.
 *
 * @param run Running line.
 * @returns Points.
 */
function solidScriptPathBuildArc(run: SolidScriptBlockRun): THREE.Vector3[] {
  return solidScriptPathArc(
    solidScriptPathFieldVector(run, 'center', 'Center'),
    solidScriptPathFieldNumber(run, 'radius', 'Radius'),
    solidScriptPathFieldNumber(run, 'start', 'Start'),
    solidScriptPathFieldNumber(run, 'sweep', 'Sweep'),
    solidScriptPathFieldVector(run, 'normal', 'Normal'),
    solidScriptPathCount(run),
    'Path',
  );
}

/**
 * Builds a Spiral Path.
 *
 * @param run Running line.
 * @returns Points.
 */
function solidScriptPathBuildSpiral(run: SolidScriptBlockRun): THREE.Vector3[] {
  return solidScriptPathSpiral(
    solidScriptPathFieldVector(run, 'center', 'Center'),
    solidScriptPathFieldNumber(run, 'radius', 'Radius'),
    solidScriptPathFieldNumber(run, 'end_radius', 'End Radius'),
    solidScriptPathFieldNumber(run, 'height', 'Height'),
    solidScriptPathFieldNumber(run, 'turns', 'Turns'),
    solidScriptPathFieldNumber(run, 'start', 'Start'),
    solidScriptPathFieldVector(run, 'normal', 'Normal'),
    solidScriptPathCount(run),
    'Path',
  );
}

/**
 * Reads Points and rounds the corners by Radius.
 *
 * @param run Running line.
 * @returns Points.
 */
function solidScriptPathBuildFromPoints(run: SolidScriptBlockRun): THREE.Vector3[] {
  const points = solidScriptPathPointsRead(run);
  return solidScriptPathRound(
    points,
    (index) => solidScriptPathCornerRadius(run, points, index),
    solidScriptPathFieldNumber(run, 'sides', 'Sides'),
    run.fields().flag('closed'),
    'Path',
    run.fields().flag('limit_radius'),
  );
}

/**
 * Bends a smooth curve through Points.
 *
 * @param run Running line.
 * @returns Points.
 */
function solidScriptPathBuildSmooth(run: SolidScriptBlockRun): THREE.Vector3[] {
  return solidScriptPathSmooth(
    solidScriptPathPointsRead(run),
    solidScriptPathFieldNumber(run, 'sides', 'Sides'),
    run.fields().flag('closed'),
    'Path',
  );
}

/**
 * Reads the Points list of Path From Points or Smooth Path.
 *
 * @param run Running line.
 * @returns Points.
 */
function solidScriptPathPointsRead(run: SolidScriptBlockRun): THREE.Vector3[] {
  const listed = run.value('points') as number[][];
  if (!Array.isArray(listed) || listed.length === 0)
    throw new Error('Path needs points in Points, such as [0, 0, 0], [1, 0, 0], [1, 1, 0]');
  return listed.map((entry) => {
    const [x, y, z] = entry;
    if (x === undefined || y === undefined) throw new Error('Each point in Points needs x, y, z, such as 0, 0, 0');
    return new THREE.Vector3(x, y, z ?? 0);
  });
}

/**
 * Reads Radius for one corner of Path From Points, with [$Point] and [$Index]
 * that corner.
 *
 * @param run Running line.
 * @param points Corners.
 * @param index Corner index.
 * @returns Metres.
 */
function solidScriptPathCornerRadius(
  run: SolidScriptBlockRun,
  points: readonly THREE.Vector3[],
  index: number,
): number {
  const point = points[index] ?? new THREE.Vector3();
  const radius = solidScriptValueNumber(
    run.valueWith('corner_radius', {
      $Point: new SolidScriptPoint([point.x, point.y, point.z], [0, 1, 0]),
      $Index: index,
      $Count: points.length,
    }),
  );
  if (radius === undefined) throw new Error('Path needs a number in Radius, such as 0.25 or [=[$Index] * 0.1]');
  return radius;
}

/** Fields the path blocks share, by key. */
const SOLID_SCRIPT_PATH_FIELDS = {
  from: solidScriptParameter('from', 'From', 'vector3', '0, 0, 0', 'Start of the path, in metres, such as 0, 0, 0.'),
  to: solidScriptParameter('to', 'To', 'vector3', '1, 0, 0', 'End of the path, in metres, such as 4, 0, 0.'),
  center: solidScriptParameter(
    'center',
    'Center',
    'vector3',
    '0, 0, 0',
    'Middle of the arc or spiral, in metres, such as 0, 0, 0.',
  ),
  radius: solidScriptParameter(
    'radius',
    'Radius',
    'number',
    '1',
    'Radius of the arc, or the start of the spiral, in metres, such as 2.',
  ),
  start: solidScriptParameter('start', 'Start', 'number', '0', 'Angle of the first point, in degrees, such as 0.'),
  normal: solidScriptParameter(
    'normal',
    'Normal',
    'vector3',
    '0, 1, 0',
    'Axis of the arc or spiral, such as 0, 1, 0 for a path on the ground.',
  ),
  points: solidScriptParameter(
    'points',
    'Points',
    'points3',
    '[0, 0, 0], [1, 0, 0], [1, 1, 0]',
    'Points of the path, such as a list variable.',
  ),
  sides: solidScriptParameter(
    'sides',
    'Sides',
    'count',
    '4',
    `Segments of each rounded corner, or of each stretch of a Smooth Path, ${SOLID_SCRIPT_PATH_CORNER_SIDES_MIN} to ${SOLID_SCRIPT_PATH_CORNER_SIDES_MAX}, such as 4.`,
  ),
  closed: solidScriptParameter(
    'closed',
    'Closed',
    'boolean',
    'No',
    'Yes: join the last point back to the first, so Linear Extrude, Rotate Extrude and Offset can fill the path. Type Yes or No, such as Yes.',
  ),
  count: solidScriptParameter(
    'count',
    'Count',
    'number',
    '8',
    `How many points to write, ${SOLID_SCRIPT_PATH_COUNT_MIN} to ${SOLID_SCRIPT_PATH_COUNT_MAX}, such as 16.`,
  ),
} as const;

/** What differs between the path blocks. */
interface SolidScriptPathSpec {
  id: string;
  label: string;
  description: string;
  manual: string;
  stops: readonly string[];
  fields: readonly SolidScriptCommandParameter[];
  /** Keys the listing always shows, in order, after the name. */
  listed: readonly string[];
  /** Keys the listing shows only when changed. */
  optional?: readonly string[];
  build: (run: SolidScriptBlockRun) => THREE.Vector3[];
}

/** Text every path block's manual starts with. */
const SOLID_SCRIPT_PATH_MANUAL_START =
  'Writes a Path, a line of points that is open or closed, to Into, for Sweep Along Path, Place At Points or PathAt; inside Linear Extrude, Rotate Extrude or Offset a closed Path is filled instead.';

/** Into of a path block: the variable that gets the Path. */
const SOLID_SCRIPT_PATH_INTO: SolidScriptCommandParameter = {
  ...solidScriptParameterInto('the path, a Path', 'Path', 'what is made', 'label'),
  hint: 'Variable to write the Path to, such as Path.',
  optional: false,
  default: 'Path',
};

/**
 * Lists a path line: its name, the fields it always shows, then the changed
 * ones and Into when it is not Path.
 *
 * @param spec Path block.
 * @param read Listing values.
 * @returns Pieces.
 */
function solidScriptPathListing(spec: SolidScriptPathSpec, read: SolidScriptListingValues): SolidScriptListingPiece[] {
  const label = (key: string) => spec.fields.find((field) => field.key === key)?.label ?? key;
  const labelled = (key: string) => [` ${label(key)} `, read.value(key)];
  return [
    spec.label,
    ...spec.listed.flatMap((key) => (key === 'points' ? [' ', read.value(key)] : labelled(key))),
    ...(spec.optional ?? []).flatMap((key) => (read.changed(key) ? labelled(key) : [])),
    ...solidScriptListingOptions([
      read.changed('into') && read.text('into') !== 'Path' && ['Into ', read.value('into')],
    ]),
  ];
}

/**
 * Builds one path block from what makes it different.
 *
 * @param spec Path block.
 * @returns Command.
 */
function solidScriptPathCommand(spec: SolidScriptPathSpec): SolidScriptCommand {
  const closes = spec.fields.some((field) => field.key === 'closed');
  return new SolidScriptCommand({
    id: spec.id,
    label: spec.label,
    category: 'Paths',
    description: spec.description,
    synonyms: ['path', 'curve', 'rail'],
    manual: `${SOLID_SCRIPT_PATH_MANUAL_START} ${spec.manual}`,
    stops: [...spec.stops, 'An empty Into.'],
    parameters: [...spec.fields, SOLID_SCRIPT_PATH_INTO],
    listing: (read) => solidScriptPathListing(spec, read),
    execute: (run) => {
      if (run.text('into').trim() === '' && !run.planar)
        throw new Error(`${spec.label} needs a name in Into, such as Path or Rail`);
      return run.pathWrite(spec.build(run), closes && run.fields().flag('closed'));
    },
  });
}

/** Stop of the path blocks that write Count points. */
const SOLID_SCRIPT_PATH_COUNT_STOP = `A Count that is not a whole number from ${SOLID_SCRIPT_PATH_COUNT_MIN} to ${SOLID_SCRIPT_PATH_COUNT_MAX}.`;

/** Path blocks that run between two ends: Line, Bezier and Quadratic. */
const SOLID_SCRIPT_COMMANDS_PATH_ENDS: readonly SolidScriptCommand[] = [
  solidScriptPathCommand({
    id: 'line_path',
    label: 'Line Path',
    description: 'Draw a straight path from one point to another',
    manual:
      'Walks from From to To in Count points; for a direction and a length, set To to Along(From, Direction, Length). Example: Line Path From 0, 0, 0 To 4, 0, 0 Count 8 Into [Rail], then Sweep Along Path along [Rail].',
    stops: [SOLID_SCRIPT_PATH_COUNT_STOP, 'From and To at the same point.'],
    fields: [SOLID_SCRIPT_PATH_FIELDS.from, SOLID_SCRIPT_PATH_FIELDS.to, SOLID_SCRIPT_PATH_FIELDS.count],
    listed: ['from', 'to', 'count'],
    build: (run) =>
      solidScriptPathLine(
        solidScriptPathFieldVector(run, 'from', 'From'),
        solidScriptPathFieldVector(run, 'to', 'To'),
        solidScriptPathCount(run),
        'Path',
      ),
  }),
  solidScriptPathCommand({
    id: 'bezier_path',
    label: 'Bezier Path',
    description: 'Draw a curved path between two points, bent by two handles',
    manual:
      'Runs from From to To in Count points, leaving From toward From Handle and coming into To from To Handle. Example: Bezier Path From 0, 0, 0 From Handle 0, 2, 0 To Handle 4, 2, 0 To 4, 0, 0 Count 16.',
    stops: [SOLID_SCRIPT_PATH_COUNT_STOP],
    fields: [
      SOLID_SCRIPT_PATH_FIELDS.from,
      solidScriptParameter(
        'from_handle',
        'From Handle',
        'vector3',
        '0, 1, 0',
        'Point the curve heads for as it leaves From, in metres, such as 0, 2, 0; farther pulls harder.',
      ),
      solidScriptParameter(
        'to_handle',
        'To Handle',
        'vector3',
        '1, 1, 0',
        'Point the curve comes from as it reaches To, in metres, such as 4, 2, 0.',
      ),
      SOLID_SCRIPT_PATH_FIELDS.to,
      SOLID_SCRIPT_PATH_FIELDS.count,
    ],
    listed: ['from', 'from_handle', 'to_handle', 'to', 'count'],
    build: solidScriptPathBuildBezier,
  }),
  solidScriptPathCommand({
    id: 'quadratic_path',
    label: 'Quadratic Path',
    description: 'Draw a curved path between two points, pulled toward a middle point',
    manual:
      'Runs from From to To in Count points, pulled toward Middle, passing halfway between Middle and the middle of From and To. Example: Quadratic Path From 0, 0, 0 Middle 2, 2, 0 To 4, 0, 0 Count 12.',
    stops: [SOLID_SCRIPT_PATH_COUNT_STOP],
    fields: [
      SOLID_SCRIPT_PATH_FIELDS.from,
      solidScriptParameter(
        'middle',
        'Middle',
        'vector3',
        '0.5, 1, 0',
        'Point the curve is pulled toward between From and To, in metres, such as 2, 2, 0.',
      ),
      SOLID_SCRIPT_PATH_FIELDS.to,
      SOLID_SCRIPT_PATH_FIELDS.count,
    ],
    listed: ['from', 'middle', 'to', 'count'],
    build: solidScriptPathBuildQuadratic,
  }),
];

/** Path blocks that turn around a Center: Arc and Spiral. */
const SOLID_SCRIPT_COMMANDS_PATH_TURNS: readonly SolidScriptCommand[] = [
  solidScriptPathCommand({
    id: 'arc_path',
    label: 'Arc Path',
    description: 'Draw a path along a circular arc',
    manual:
      'Turns around Center in the plane facing Normal, from Start by Sweep degrees, in Count points, the same way as RotateVector around Normal; a negative Sweep turns the other way. Closed joins the last point back to the first. Example: Arc Path Center 0, 0, 0 Radius 2 Sweep 90 Count 16.',
    stops: [SOLID_SCRIPT_PATH_COUNT_STOP, 'A Sweep of 0, a Radius of 0 or a Normal of 0, 0, 0.'],
    fields: [
      SOLID_SCRIPT_PATH_FIELDS.center,
      SOLID_SCRIPT_PATH_FIELDS.radius,
      SOLID_SCRIPT_PATH_FIELDS.start,
      solidScriptParameter(
        'sweep',
        'Sweep',
        'number',
        '180',
        'How many degrees the arc turns, the same way as RotateVector around Normal, such as 90. A negative value turns the other way.',
      ),
      SOLID_SCRIPT_PATH_FIELDS.normal,
      SOLID_SCRIPT_PATH_FIELDS.closed,
      SOLID_SCRIPT_PATH_FIELDS.count,
    ],
    listed: ['center', 'radius', 'sweep', 'count'],
    build: solidScriptPathBuildArc,
  }),
  solidScriptPathCommand({
    id: 'spiral_path',
    label: 'Spiral Path',
    description: 'Draw a path along a spiral or helix',
    manual:
      'Turns around Center in the plane facing Normal from Start, climbing Height along Normal while the radius moves from Radius to End Radius, for Turns of a rotation, in Count points. Example: Spiral Path Center 0, 0, 0 Radius 1 End Radius 1 Height 4 Turns 3 Count 64 makes a helix.',
    stops: [SOLID_SCRIPT_PATH_COUNT_STOP, 'Turns of 0 or a Normal of 0, 0, 0.'],
    fields: [
      SOLID_SCRIPT_PATH_FIELDS.center,
      SOLID_SCRIPT_PATH_FIELDS.radius,
      solidScriptParameter(
        'end_radius',
        'End Radius',
        'number',
        '1',
        'Radius at the end of the spiral, in metres, such as 2. The same as Radius gives a helix.',
      ),
      solidScriptParameter(
        'height',
        'Height',
        'number',
        '1',
        'How far the spiral climbs along Normal, in metres, such as 4. 0 stays flat.',
      ),
      solidScriptParameter(
        'turns',
        'Turns',
        'number',
        '2',
        'How many turns the spiral makes, such as 3. A negative value turns the other way.',
      ),
      SOLID_SCRIPT_PATH_FIELDS.start,
      SOLID_SCRIPT_PATH_FIELDS.normal,
      SOLID_SCRIPT_PATH_FIELDS.count,
    ],
    listed: ['center', 'radius', 'end_radius', 'height', 'turns', 'count'],
    build: solidScriptPathBuildSpiral,
  }),
];

/** Path blocks that run through a list of Points: From Points and Smooth. */
const SOLID_SCRIPT_COMMANDS_PATH_LISTED: readonly SolidScriptCommand[] = [
  solidScriptPathCommand({
    id: 'path_from_points',
    label: 'Path From Points',
    description: 'Draw a path through corner points, with optional rounding',
    manual:
      'Uses the corners in Points; Radius rounds those corners, with Sides segments on each, and can change per corner with [$Index]; Limit Radius shrinks radii that do not fit. Closed joins the last point back to the first and rounds that corner too. Example: Path From Points [0, 0, 0], [4, 0, 0], [4, 0, 4] Radius 0.5.',
    stops: [
      'A Points list with fewer than 2 different points, or 3 when Closed or when rounding corners.',
      'A corner Radius too big for a stretch, or Sides outside 1 to 64.',
    ],
    fields: [
      SOLID_SCRIPT_PATH_FIELDS.points,
      solidScriptParameterEach(
        solidScriptParameter(
          'corner_radius',
          'Radius',
          'number',
          '0',
          'Metres to round each corner by, such as 0.25, or per corner with [$Index], such as [=[$Index] * 0.1]. 0 keeps a corner sharp.',
        ),
        'Point',
      ),
      solidScriptParameter(
        'limit_radius',
        'Limit Radius',
        'boolean',
        'No',
        'Yes: shrink a corner radius that does not fit, so the rounded corners never overlap; No stops with a message instead. Type Yes or No, such as Yes.',
      ),
      SOLID_SCRIPT_PATH_FIELDS.sides,
      SOLID_SCRIPT_PATH_FIELDS.closed,
    ],
    listed: ['points'],
    optional: ['corner_radius', 'limit_radius'],
    build: solidScriptPathBuildFromPoints,
  }),
  solidScriptPathCommand({
    id: 'smooth_path',
    label: 'Smooth Path',
    description: 'Draw a smooth curved path through points',
    manual:
      'Bends a gentle curve through every point in Points, with Sides segments on each stretch. Closed joins the last point back to the first. Example: Smooth Path [0, 0, 0], [2, 1, 0], [4, 0, 0] Sides 8.',
    stops: ['A Points list with fewer than 2 different points, or 3 when Closed.', 'Sides outside 1 to 64.'],
    fields: [SOLID_SCRIPT_PATH_FIELDS.points, SOLID_SCRIPT_PATH_FIELDS.sides, SOLID_SCRIPT_PATH_FIELDS.closed],
    listed: ['points'],
    optional: ['sides'],
    build: solidScriptPathBuildSmooth,
  }),
];

/** Blocks that draw a Path: one per kind of path. */
export const SOLID_SCRIPT_COMMANDS_PATH_SHAPES: readonly SolidScriptCommand[] = [
  ...SOLID_SCRIPT_COMMANDS_PATH_ENDS,
  ...SOLID_SCRIPT_COMMANDS_PATH_TURNS,
  ...SOLID_SCRIPT_COMMANDS_PATH_LISTED,
];
