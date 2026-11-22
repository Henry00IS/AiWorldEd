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
