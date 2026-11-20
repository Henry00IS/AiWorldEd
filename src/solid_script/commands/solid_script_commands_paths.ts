import * as THREE from 'three';
import { solidScriptBodyPrism } from '@/solid_script/language/solid_script_body.js';
import { SolidScriptCommand } from './solid_script_command.js';
import {
  solidScriptListingOptions,
  type SolidScriptListingPiece,
  type SolidScriptListingValues,
} from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterInto,
  solidScriptParameterOptional,
  solidScriptParameterWhen,
  solidScriptParameterWords,
} from './solid_script_command_parameters.js';
import { solidScriptFaceWrite } from './solid_script_face_of.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptMemberVector } from '@/solid_script/language/solid_script_members.js';
import { solidScriptPathMesh, solidScriptPathSweep } from '@/solid_script/language/solid_script_path.js';
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
import { solidScriptValueNumber, solidScriptValueNumbers } from '@/solid_script/language/solid_script_value.js';

/** Most sides of a round Curve To Mesh profile. */
const SOLID_SCRIPT_SWEEP_SIDES_MAX = 64;

/** Shapes a Path line can build. */
const SOLID_SCRIPT_PATH_SHAPES = ['Line', 'Arc', 'Spiral', 'From Points'] as const;

/** One Shape word. */
type SolidScriptPathShape = (typeof SOLID_SCRIPT_PATH_SHAPES)[number];

/**
 * Reads the profile: the listed outline, or a round one of Radius and Sides.
 *
 * @param run Running line.
 * @returns Profile corners, counter-clockwise.
 */
function solidScriptSweepProfile(run: SolidScriptBlockRun): THREE.Vector2[] {
  const listed = run.value('profile') as number[][];
  if (listed.length > 0) {
    if (listed.length < 3) throw new Error(`Profile needs at least 3 points, not ${listed.length}`);
    const corners = listed.map(([x, y]) => new THREE.Vector2(x, y));
    return THREE.ShapeUtils.isClockWise(corners) ? corners.reverse() : corners;
  }
  const fields = run.fields();
  const radius = fields.positive('radius', fields.number('radius', 0.1));
  const sides = Math.round(fields.number('sides', 8));
  if (sides < 3 || sides > SOLID_SCRIPT_SWEEP_SIDES_MAX)
    throw fields.error('sides', `must be 3 to ${SOLID_SCRIPT_SWEEP_SIDES_MAX}`, sides);
  return Array.from({ length: sides }, (_, index) => {
    const angle = ((index + 0.5) * Math.PI * 2) / sides;
    return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
}

/**
 * Reads Shape, or Line when the field is empty.
 *
 * @param run Running line.
 * @returns Shape word.
 */
function solidScriptPathShapeOf(run: SolidScriptBlockRun): SolidScriptPathShape {
  const text = run.text('shape').trim() || 'Line';
  const match = SOLID_SCRIPT_PATH_SHAPES.find((word) => word.toLowerCase() === text.toLowerCase());
  if (!match) throw new Error(`Shape needs Line, Arc, Spiral or From Points, not ${text}`);
  return match;
}

/**
 * Reads a three-number vector field.
 *
 * @param run Running line.
 * @param key Field key.
 * @param label Field caption.
 * @returns Vector.
 */
function solidScriptPathFieldVector(run: SolidScriptBlockRun, key: string, label: string): THREE.Vector3 {
  const numbers = solidScriptValueNumbers(run.value(key));
  const x = numbers?.[0];
  const y = numbers?.[1];
  const z = numbers?.[2];
  if (!numbers || numbers.length !== 3 || x === undefined || y === undefined || z === undefined)
    throw new Error(`${label} needs three numbers as x, y, z, such as 0, 1, 0`);
  return new THREE.Vector3(x, y, z);
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
 * Builds the points of a Path line.
 *
 * @param run Running line.
 * @returns Points.
 */
function solidScriptPathBuild(run: SolidScriptBlockRun): THREE.Vector3[] {
  const shape = solidScriptPathShapeOf(run);
  if (shape === 'From Points') return solidScriptPathFromPoints(run);
  const count = solidScriptPathFieldNumber(run, 'count', 'Count');
  if (shape === 'Line')
    return solidScriptPathLine(
      solidScriptPathFieldVector(run, 'from', 'From'),
      solidScriptPathFieldVector(run, 'to', 'To'),
      count,
      'Path',
    );
  if (shape === 'Arc') return solidScriptPathBuildArc(run, count);
  return solidScriptPathBuildSpiral(run, count);
}

/**
 * Builds an Arc path.
 *
 * @param run Running line.
 * @param count How many points.
 * @returns Points.
 */
function solidScriptPathBuildArc(run: SolidScriptBlockRun, count: number): THREE.Vector3[] {
  return solidScriptPathArc(
    solidScriptPathFieldVector(run, 'center', 'Center'),
    solidScriptPathFieldNumber(run, 'radius', 'Radius'),
    solidScriptPathFieldNumber(run, 'start', 'Start'),
    solidScriptPathFieldNumber(run, 'sweep', 'Sweep'),
    solidScriptPathFieldVector(run, 'normal', 'Normal'),
    count,
    'Path',
  );
}

/**
 * Builds a Spiral path.
 *
 * @param run Running line.
 * @param count How many points.
 * @returns Points.
 */
function solidScriptPathBuildSpiral(run: SolidScriptBlockRun, count: number): THREE.Vector3[] {
  return solidScriptPathSpiral(
    solidScriptPathFieldVector(run, 'center', 'Center'),
    solidScriptPathFieldNumber(run, 'radius', 'Radius'),
    solidScriptPathFieldNumber(run, 'end_radius', 'End Radius'),
    solidScriptPathFieldNumber(run, 'height', 'Height'),
    solidScriptPathFieldNumber(run, 'turns', 'Turns'),
    solidScriptPathFieldNumber(run, 'start', 'Start'),
    solidScriptPathFieldVector(run, 'normal', 'Normal'),
    count,
    'Path',
  );
}

/**
 * Reads Points and optionally rounds the corners.
 *
 * @param run Running line.
 * @returns Points.
 */
function solidScriptPathFromPoints(run: SolidScriptBlockRun): THREE.Vector3[] {
  const listed = run.value('points') as number[][];
  if (!Array.isArray(listed) || listed.length === 0)
    throw new Error('Path needs points in Points, such as [0, 0, 0], [1, 0, 0], [1, 1, 0]');
  const points = listed.map((entry) => {
    const [x, y, z] = entry;
    if (x === undefined || y === undefined) throw new Error('Each point in Points needs x, y, z, such as 0, 0, 0');
    return new THREE.Vector3(x, y, z ?? 0);
  });
  return solidScriptPathRound(
    points,
    solidScriptPathFieldNumber(run, 'corner_radius', 'Radius'),
    solidScriptPathFieldNumber(run, 'sides', 'Sides'),
    run.fields().flag('closed'),
    'Path',
  );
}

/**
 * Lists a Path line, showing only the fields its Shape uses.
 *
 * @param read Listing values.
 * @returns Pieces.
 */
function solidScriptPathListing(read: SolidScriptListingValues): SolidScriptListingPiece[] {
  const shape = read.text('shape').trim().toLowerCase();
  return [
    'Path',
    ...solidScriptPathListingFields(read, shape),
    ...solidScriptListingOptions([
      read.changed('into') && read.text('into') !== 'Path' && ['Into ', read.value('into')],
    ]),
  ];
}

/**
 * Shape-specific pieces of a Path listing.
 *
 * @param read Listing values.
 * @param shape Shape word, lower case.
 * @returns Pieces.
 */
function solidScriptPathListingFields(read: SolidScriptListingValues, shape: string): SolidScriptListingPiece[] {
  if (shape === '' || shape === 'line') return solidScriptPathListingKeys(read, ['from', 'to', 'count']);
  if (shape === 'arc')
    return [read.value('shape'), ...solidScriptPathListingKeys(read, ['center', 'radius', 'sweep', 'count'])];
  if (shape === 'spiral')
    return [
      read.value('shape'),
      ...solidScriptPathListingKeys(read, ['center', 'radius', 'end_radius', 'height', 'turns', 'count']),
    ];
  return [
    read.value('shape'),
    ' ',
    read.value('points'),
    ...(read.changed('corner_radius') ? [' Radius ', read.value('corner_radius')] : []),
  ];
}

/**
 * Labelled field pieces for a Path listing.
 *
 * @param read Listing values.
 * @param keys Field keys, in order.
 * @returns Pieces.
 */
function solidScriptPathListingKeys(
  read: SolidScriptListingValues,
  keys: readonly string[],
): SolidScriptListingPiece[] {
  const labels: Record<string, string> = {
    from: ' From ',
    to: ' To ',
    count: ' Count ',
    center: ' Center ',
    radius: ' Radius ',
    sweep: ' Sweep ',
    end_radius: ' End Radius ',
    height: ' Height ',
    turns: ' Turns ',
  };
  return keys.flatMap((key) => [labels[key] ?? ` ${key} `, read.value(key)]);
}

/** Commands that build along paths. */
export const SOLID_SCRIPT_COMMANDS_PATHS: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'path',
    label: 'Path',
    category: 'Meshes',
    description: 'Build a list of points along a line, arc, spiral or polyline',
    manual:
      'Writes a list of points to Into, for Curve To Mesh, Place At Points or PathAt. Shape Line (the default) walks from From to To. Arc turns around Center in the plane facing Normal, from Start by Sweep degrees, the same way as RotateVector around Normal; a negative Sweep turns the other way. Spiral also climbs Height along Normal while the radius moves from Radius to End Radius, for Turns of a rotation. From Points uses the corners in Points; Radius rounds those corners, with Sides segments on each, and Closed joins the last point back to the first. Count is how many points Line, Arc and Spiral write. Example: Path Line From 0, 0, 0 To 4, 0, 0 Count 8 Into [Rail], then Curve To Mesh along [Rail].',
    stops: [
      'A Shape other than Line, Arc, Spiral or From Points.',
      'A Count that is not a whole number from 2 to 10000, when Shape is Line, Arc or Spiral.',
      'From and To at the same point, a Sweep or Turns of 0, a Radius of 0 on an Arc, or a Normal of 0, 0, 0.',
      'A Points list with fewer than 2 different points, or 3 when Closed or when rounding corners.',
      'A corner Radius too big for a stretch, or Sides outside 1 to 64.',
      'An empty Into.',
    ],
    parameters: [
      solidScriptParameterWords(
        'shape',
        'Shape',
        'text',
        'Line',
        'The kind of path: Line, Arc, Spiral or From Points. Type one word, such as Arc.',
        [
          { word: 'Line', detail: 'A straight line from From to To' },
          { word: 'Arc', detail: 'A circular arc around Center' },
          { word: 'Spiral', detail: 'A spiral or helix around Center' },
          { word: 'From Points', detail: 'The corners in Points, with optional rounding' },
        ],
      ),
      solidScriptParameterWhen(
        solidScriptParameter('from', 'From', 'vector3', '0, 0, 0', 'Start of the line, in metres, such as 0, 0, 0.'),
        'shape',
        ['Line'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter('to', 'To', 'vector3', '1, 0, 0', 'End of the line, in metres, such as 4, 0, 0.'),
        'shape',
        ['Line'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'center',
          'Center',
          'vector3',
          '0, 0, 0',
          'Middle of the arc or spiral, in metres, such as 0, 0, 0.',
        ),
        'shape',
        ['Arc', 'Spiral'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'radius',
          'Radius',
          'number',
          '1',
          'Radius of the arc, or the start of the spiral, in metres, such as 2.',
        ),
        'shape',
        ['Arc', 'Spiral'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'end_radius',
          'End Radius',
          'number',
          '1',
          'Radius at the end of the spiral, in metres, such as 2. The same as Radius gives a helix.',
        ),
        'shape',
        ['Spiral'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'height',
          'Height',
          'number',
          '1',
          'How far the spiral climbs along Normal, in metres, such as 4. 0 stays flat.',
        ),
        'shape',
        ['Spiral'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'turns',
          'Turns',
          'number',
          '2',
          'How many turns the spiral makes, such as 3. A negative value turns the other way.',
        ),
        'shape',
        ['Spiral'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter('start', 'Start', 'number', '0', 'Angle of the first point, in degrees, such as 0.'),
        'shape',
        ['Arc', 'Spiral'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'sweep',
          'Sweep',
          'number',
          '180',
          'How many degrees the arc turns, the same way as RotateVector around Normal, such as 90. A negative value turns the other way.',
        ),
        'shape',
        ['Arc'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'normal',
          'Normal',
          'vector3',
          '0, 1, 0',
          'Axis of the arc or spiral, such as 0, 1, 0 for a path on the ground.',
        ),
        'shape',
        ['Arc', 'Spiral'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'points',
          'Points',
          'points3',
          '[0, 0, 0], [1, 0, 0], [1, 1, 0]',
          'Corners of the path, such as a list variable.',
        ),
        'shape',
        ['From Points'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'corner_radius',
          'Radius',
          'number',
          '0',
          'Metres to round each corner by, such as 0.25. 0 keeps the corners sharp.',
        ),
        'shape',
        ['From Points'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'sides',
          'Sides',
          'count',
          '4',
          `Segments of each rounded corner, ${SOLID_SCRIPT_PATH_CORNER_SIDES_MIN} to ${SOLID_SCRIPT_PATH_CORNER_SIDES_MAX}, such as 4.`,
        ),
        'shape',
        ['From Points'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'closed',
          'Closed',
          'boolean',
          'No',
          'Yes: join the last point back to the first, and round that corner too. Type Yes or No, such as Yes.',
        ),
        'shape',
        ['From Points'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'count',
          'Count',
          'number',
          '8',
          `How many points to write, ${SOLID_SCRIPT_PATH_COUNT_MIN} to ${SOLID_SCRIPT_PATH_COUNT_MAX}, such as 16.`,
        ),
        'shape',
        ['Line', 'Arc', 'Spiral'],
      ),
      {
        ...solidScriptParameterInto('the points, a list of vectors', 'Vector List', 'what is made', 'label'),
        hint: 'Variable to write the points to, a list of vectors, such as Path.',
        optional: false,
        default: 'Path',
      },
    ],
    listing: (read) => solidScriptPathListing(read),
    execute: (run) => {
      if (run.text('into').trim() === '') throw new Error('Path needs a name in Into, such as Path or Rail');
      solidScriptFaceWrite(
        run,
        'into',
        solidScriptPathBuild(run).map((point) => solidScriptMemberVector(point)),
      );
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'curve_to_mesh',
    named: true,
    label: 'Curve To Mesh',
    category: 'Meshes',
    description: 'Sweep a profile along a path',
    manual:
      'Sweeps a flat profile along a path of points, like a pipe, rail or moulding. The profile is a circle of Radius and Sides, or the x, y outline in Profile, where x runs to the side of the path and y up. Each stretch of the path becomes one solid, and the joints are cut on the mitre between two stretches so the pieces meet exactly. A dented profile fills in as a solid; with As Mesh on, the whole sweep is one mesh instead and keeps any profile. Closed joins the last point back to the first. Example: a path from Path or Resample of a few points, Radius 0.05, gives a round handrail.',
    stops: [
      'A Path with fewer than 2 different points, or 3 when Closed.',
      'A Profile with fewer than 3 points, or points that are not x, y.',
      `Sides below 3 or above ${SOLID_SCRIPT_SWEEP_SIDES_MAX}, or a Radius that is not above 0.`,
    ],
    parameters: [
      solidScriptParameter(
        'path',
        'Path',
        'points3',
        '[0, 0, 0], [1, 0, 0], [2, 1, 0]',
        'Points the profile follows, such as a list variable [Path].',
      ),
      solidScriptParameter('radius', 'Radius', 'number', '0.1', 'Radius of the round profile in metres, such as 0.1.'),
      solidScriptParameter(
        'sides',
        'Sides',
        'count',
        '8',
        `Sides of the round profile, 3 to ${SOLID_SCRIPT_SWEEP_SIDES_MAX}, such as 8.`,
      ),
      solidScriptParameterOptional(
        'profile',
        'Profile',
        'points2',
        'Optional: an x, y outline swept instead of the circle, written as vectors whose z is ignored, such as [0, 0, 0], [0.2, 0, 0], [0.2, 0.1, 0].',
      ),
      solidScriptParameter(
        'closed',
        'Closed',
        'boolean',
        'No',
        'Yes: join the last point back to the first. Type Yes or No, such as Yes.',
      ),
      solidScriptParameter(
        'mesh',
        'As Mesh',
        'boolean',
        'No',
        'Yes: build one mesh. No: one solid per stretch. Type Yes or No, such as Yes.',
      ),
    ],
    listing: (read) => [
      'Curve To Mesh',
      'Along ',
      read.value('path'),
      ...solidScriptListingOptions([
        read.changed('profile') ? ['Profile ', read.value('profile')] : ['Radius ', read.value('radius')],
        read.on('closed') && ['Closed'],
        read.on('mesh') && ['As Mesh'],
      ]),
    ],
    execute: (run) => {
      const path = (run.value('path') as number[][]).map(([x, y, z]) => new THREE.Vector3(x, y, z));
      const profile = solidScriptSweepProfile(run);
      const fields = run.fields();
      const closed = fields.flag('closed');
      const rings = solidScriptPathSweep(path, profile, closed);
      if (fields.flag('mesh')) return run.mesh(solidScriptPathMesh(rings, closed, 'Curve To Mesh'));
      return rings.slice(1).flatMap((ring, index) => {
        const before = rings[index];
        return before ? run.solid(solidScriptBodyPrism(before, ring, 'Curve To Mesh')) : [];
      });
    },
  }),
];
