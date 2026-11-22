import type { SolidScriptFunctionDoc } from './solid_script_function_docs.js';
import { solidScriptFunctionDocSummary } from './solid_script_function_docs_math.js';
import type { SolidScriptBuiltinName } from './solid_script_functions_builtin.js';

/** Docs of the shaping functions and Euler turns. */
export const SOLID_SCRIPT_FUNCTION_DOCS_SHAPING = {
  remap: {
    usage: 'Remap(value, from_low, from_high, to_low, to_high, clamp)',
    summary: solidScriptFunctionDocSummary(
      'Moves a number from one range into another, keeping its place in the range. Midway through 0 to 10 becomes midway through 0 to 100. Past the ends it stays at the target ends; Clamp false lets it go on past them. On a vector it works on each axis.',
      ['Remap(5, 0, 10, 0, 100) is 50.', 'Remap(15, 0, 10, 0, 100) is 100.', 'Remap(15, 0, 10, 0, 100, false) is 150.'],
      'Use it to turn a 0-to-1 blend into a real height, or a distance into a falloff.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  smooth_min: {
    usage: 'SmoothMin(a, b, distance)',
    summary: solidScriptFunctionDocSummary(
      'The smaller of two numbers, but rounded off where they come within Distance of each other, so there is no sharp corner where one takes over. Distance 0 is plain Min. On a vector it works on each axis.',
      ['SmoothMin(0, 5, 1) is 0.', 'SmoothMin(1, 1, 1) is 0.75.', 'SmoothMin(2, 3, 0) is 2.'],
      'Use it to blend two height curves into one smooth valley, or to soften where a ramp meets the floor.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  smooth_max: {
    usage: 'SmoothMax(a, b, distance)',
    summary: solidScriptFunctionDocSummary(
      'The larger of two numbers, rounded off where they come within Distance of each other. Distance 0 is plain Max. On a vector it works on each axis.',
      ['SmoothMax(0, 5, 1) is 5.', 'SmoothMax(1, 1, 1) is 1.25.'],
      'Use it to merge two hills into one smooth ridge.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  ping_pong: {
    usage: 'PingPong(value, length)',
    summary: solidScriptFunctionDocSummary(
      'Bounces a number back and forth between 0 and Length, like a ball between two walls: it climbs to Length, then comes back down to 0, and climbs again. On a vector it works on each axis.',
      ['PingPong(1.5, 2) is 1.5.', 'PingPong(3, 2) is 1.', 'PingPong(5, 2) is 1.'],
      'Use it for a zigzag along a wall, or heights that go up and down in a row of pillars.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  accumulate: {
    usage: 'Accumulate(list)',
    summary: solidScriptFunctionDocSummary(
      'Running sums of a list: each item becomes the total of itself and everything before it. The last item is the same as Sum.',
      ['Accumulate(List(1, 2, 3)) is List(1, 3, 6).', 'Accumulate(List()) is List().'],
      'Use it to stack steps of different heights, or to place planks of different widths side by side.',
    ),
    group: 'List',
    gives: ['Number List'],
  },
  rotate_euler: {
    usage: 'RotateEuler(vector, angles)',
    summary: solidScriptFunctionDocSummary(
      'Turns a point or a direction by three angles in degrees: first around X, then around Y, then around Z, the same way Rotate turns a solid.',
      [
        'RotateEuler(Vector(1, 0, 0), Vector(0, 0, 90)) turns a point on the right up to Vector(0, 1, 0).',
        'RotateEuler(Vector(1, 0, 0), Vector(0, 0, 0)) is Vector(1, 0, 0).',
      ],
      'Use it to point a detail the way a rotated solid faces, or to turn an offset with the object it belongs to.',
    ),
    group: 'Vector',
    gives: ['Vector'],
  },
} as const satisfies Partial<Record<SolidScriptBuiltinName, SolidScriptFunctionDoc>>;

/** Docs of the matrix functions. */
export const SOLID_SCRIPT_FUNCTION_DOCS_MATRIX = {
  transform: {
    usage: 'Transform(move, rotate, scale)',
    summary: solidScriptFunctionDocSummary(
      'Packs a move, a turn and a scale into one matrix: four rows of four numbers. It scales first, then turns around X, Y and Z like Rotate, then moves.',
      ['Transform(Vector(1, 2, 3), Vector(0, 0, 0), Vector(1, 1, 1)) moves by 1, 2, 3.'],
      'Use it to keep a whole placement in one variable, then apply it with TransformPoint or undo it with Invert.',
    ),
    group: 'Vector',
    gives: ['List'],
  },
  invert: {
    usage: 'Invert(matrix)',
    summary: solidScriptFunctionDocSummary(
      'The matrix that undoes another: applying both leaves every point where it was.',
      [
        'TransformPoint(Invert(Transform(Vector(1, 0, 0), Vector(0, 0, 0), Vector(1, 1, 1))), Vector(1, 0, 0)) is Vector(0, 0, 0).',
      ],
      'Use it to turn a world point into the space of a placed object.',
    ),
    group: 'Vector',
    gives: ['List'],
  },
  transform_point: {
    usage: 'TransformPoint(matrix, point)',
    summary: solidScriptFunctionDocSummary(
      'Places a point with a matrix: it is scaled, turned and moved.',
      [
        'TransformPoint(Transform(Vector(1, 2, 3), Vector(0, 0, 0), Vector(1, 1, 1)), Vector(0, 0, 0)) is Vector(1, 2, 3).',
      ],
      'Use it for corners and positions.',
    ),
    group: 'Vector',
    gives: ['Vector'],
  },
  transform_direction: {
    usage: 'TransformDirection(matrix, direction)',
    summary: solidScriptFunctionDocSummary(
      'Turns and scales a direction with a matrix but does not move it, since a direction has no place.',
      [
        'TransformDirection(Transform(Vector(5, 0, 0), Vector(0, 0, 0), Vector(1, 1, 1)), Vector(0, 1, 0)) is Vector(0, 1, 0).',
      ],
      'Use it for normals, offsets and the way something faces.',
    ),
    group: 'Vector',
    gives: ['Vector'],
  },
  matrix_move: {
    usage: 'MatrixMove(matrix)',
    summary: solidScriptFunctionDocSummary(
      'The move a matrix makes: where it puts 0, 0, 0.',
      ['MatrixMove(Transform(Vector(1, 2, 3), Vector(0, 0, 0), Vector(1, 1, 1))) is Vector(1, 2, 3).'],
      'Use it to read the position back out of a placement.',
    ),
    group: 'Vector',
    gives: ['Vector'],
  },
  rotate_by: {
    usage: 'RotateBy(rotation, by, local)',
    summary: solidScriptFunctionDocSummary(
      'Composes two turns in X, Y, Z degrees: By in world space, or in the rotated space when Local is true.',
      ['RotateBy(Vector(0, 90, 0), Vector(0, 0, 0)) is Vector(0, 90, 0).'],
      'Use it to turn a rotation without adding its angles, which is not the same as composing turns.',
    ),
    group: 'Vector',
    gives: ['Vector'],
  },
  matrix_rotate: {
    usage: 'MatrixRotate(matrix)',
    summary: solidScriptFunctionDocSummary(
      'The turn a matrix makes, as degrees around X, Y and Z in the order Rotate uses.',
      ['MatrixRotate(Transform(Vector(0, 0, 0), Vector(0, 0, 0), Vector(1, 1, 1))) is Vector(0, 0, 0).'],
      'Use it to read the rotation back out of a placement.',
    ),
    group: 'Vector',
    gives: ['Vector'],
  },
  matrix_scale: {
    usage: 'MatrixScale(matrix)',
    summary: solidScriptFunctionDocSummary(
      'The scale a matrix makes along each axis.',
      ['MatrixScale(Transform(Vector(0, 0, 0), Vector(0, 0, 0), Vector(2, 1, 1))) is Vector(2, 1, 1).'],
      'Use it to read the size back out of a placement.',
    ),
    group: 'Vector',
    gives: ['Vector'],
  },
} as const satisfies Partial<Record<SolidScriptBuiltinName, SolidScriptFunctionDoc>>;
