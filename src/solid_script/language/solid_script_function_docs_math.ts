import type { SolidScriptFunctionDoc } from './solid_script_function_docs.js';
import type { SolidScriptBuiltinName } from './solid_script_functions_builtin.js';

/**
 * Builds a function summary: a short lead, examples each on their own line, and
 * a typical use.
 *
 * @param lead One or two sentences of what it means.
 * @param examples Calls as typed, each with what it gives, such as Sin(90) is
 *   1.
 * @param use How it is typically used in a level.
 * @returns Summary text.
 */
export function solidScriptFunctionDocSummary(lead: string, examples: readonly string[], use: string): string {
  return [lead, '', 'Example:', ...examples, '', use].join('\n');
}

/**
 * Docs of the Math, Trigonometry and Vector functions, with beginner-friendly
 * explanations and examples that run as typed.
 */
export const SOLID_SCRIPT_FUNCTION_DOCS_MATH = {
  sin: {
    usage: 'Sin(degrees)',
    summary: solidScriptFunctionDocSummary(
      'Sine goes around a circle and tells you how high you are, from -1 at the bottom to 1 at the top. Zero degrees sits on the right, 90 at the top. On a vector it works on each axis.',
      ['Sin(0) is 0.', 'Sin(90) is 1.', 'Sin(30) is 0.5.'],
      'Pair it with Cos to walk a spiral stair or to bend an arch. On its own it makes a wave.',
    ),
    group: 'Trigonometry',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  cos: {
    usage: 'Cos(degrees)',
    summary: solidScriptFunctionDocSummary(
      'Cosine goes around a circle and tells you how far right you are, from 1 on the right to -1 on the left. Zero degrees is the right side, 180 the left. On a vector it works on each axis.',
      ['Cos(0) is 1.', 'Cos(90) is 0.', 'Cos(180) is -1.'],
      'With Sin, it places each step of a spiral, or the points of an arch, around a centre.',
    ),
    group: 'Trigonometry',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  tan: {
    usage: 'Tan(degrees)',
    summary: solidScriptFunctionDocSummary(
      'Tangent is how steep a slope is at that angle: a shallow ramp is a small number, a 45 degree ramp is 1, and a wall goes huge. On a vector it works on each axis.',
      ['Tan(0) is 0.', 'Tan(45) is 1.'],
      'Use it for the rise of a ramp or the slope of a roof.',
    ),
    group: 'Trigonometry',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  asin: {
    usage: 'Asin(value)',
    summary: solidScriptFunctionDocSummary(
      'Gives the angle, from -90 to 90, whose Sin is the number you already have. Handy when you know a height on a circle and want the turn. On a vector it works on each axis.',
      ['Asin(0) is 0.', 'Asin(1) is 90.', 'Asin(0.5) is 30.'],
      'Use it to find the angle of an arch from how high it has risen.',
    ),
    group: 'Trigonometry',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  acos: {
    usage: 'Acos(value)',
    summary: solidScriptFunctionDocSummary(
      'Gives the angle, from 0 to 180, whose Cos is the number you already have. On a vector it works on each axis.',
      ['Acos(1) is 0.', 'Acos(0) is 90.', 'Acos(-1) is 180.'],
      'Use it to find how far around a circle a point has travelled.',
    ),
    group: 'Trigonometry',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  atan: {
    usage: 'Atan(value)',
    summary: solidScriptFunctionDocSummary(
      'Gives the angle, from -90 to 90, whose Tan is the number you already have. For a slope, this is the angle of the ramp. On a vector it works on each axis.',
      ['Atan(0) is 0.', 'Atan(1) is 45.'],
      'Use it to tilt a ramp or a roof to match a rise and a run.',
    ),
    group: 'Trigonometry',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  atan2: {
    usage: 'Atan2(y, x)',
    summary: solidScriptFunctionDocSummary(
      'The direction in degrees from the origin to a point, measured from the +X axis. Unlike Atan, it uses both X and Y, so it knows a full 360 degree turn, including left versus right.',
      ['Atan2(0, 1) is 0.', 'Atan2(1, 0) is 90.', 'Atan2(0, -1) is 180.'],
      'Use it to face a wall or a step toward a point, or to turn a spiral as it climbs.',
    ),
    group: 'Trigonometry',
    gives: ['Number'],
  },
  radians: {
    usage: 'Radians(degrees)',
    summary: solidScriptFunctionDocSummary(
      'Turns a degrees angle into radians, another way to measure a turn. A half turn is [$Math.Pi], a whole turn is [$Math.Tau]. Sin and Cos already take degrees, so you only need this when a formula asks for radians.',
      ['Radians(180) is [$Math.Pi].', 'Radians(360) is [$Math.Tau].'],
      'Use it when you mix a degrees turn with a formula that counts in radians.',
    ),
    group: 'Trigonometry',
    gives: ['Number'],
  },
  degrees: {
    usage: 'Degrees(radians)',
    summary: solidScriptFunctionDocSummary(
      'Turns a radians angle back into degrees, the units Sin and Cos already use.',
      ['Degrees([$Math.Pi]) is 180.', 'Degrees([$Math.Tau]) is 360.'],
      'Use it to read a radians result as a familiar turn, such as a half turn of 180.',
    ),
    group: 'Trigonometry',
    gives: ['Number'],
  },
  abs: {
    usage: 'Abs(number)',
    summary: solidScriptFunctionDocSummary(
      'Drops the minus sign, so the number is always zero or more. -3 and 3 both become 3: that is just how far it is from zero. On a vector it works on each axis.',
      ['Abs(-3) is 3.', 'Abs(5) is 5.', 'Abs(0) is 0.'],
      'Use it so a height, a gap or a falloff never goes negative.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  sign: {
    usage: 'Sign(number)',
    summary: solidScriptFunctionDocSummary(
      'Tells you which side of zero a number is on: -1 below, 0 at zero, 1 above. On a vector it works on each axis.',
      ['Sign(-4) is -1.', 'Sign(0) is 0.', 'Sign(7) is 1.'],
      'Use it to flip a step to the left or right, or to keep a push pointing outward.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  ceil: {
    usage: 'Ceil(number)',
    summary: solidScriptFunctionDocSummary(
      'Pushes a number up to the next whole number, so 1.2 becomes 2. A whole number stays as it is. A negative number moves toward zero, so -1.2 becomes -1. On a vector it works on each axis.',
      ['Ceil(1.2) is 2.', 'Ceil(5) is 5.', 'Ceil(-1.2) is -1.'],
      'Use it when you need enough steps or tiles to cover a length, never too few.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  floor: {
    usage: 'Floor(number)',
    summary: solidScriptFunctionDocSummary(
      'Pushes a number down to the whole number below it, so 1.8 becomes 1. A negative number goes more negative, so -1.2 becomes -2. On a vector it works on each axis.',
      ['Floor(1.8) is 1.', 'Floor(5) is 5.', 'Floor(-1.2) is -2.'],
      'Use it to pack as many full tiles as will fit, or to find which grid cell a point sits in.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  round: {
    usage: 'Round(number)',
    summary: solidScriptFunctionDocSummary(
      'Goes to the nearest whole number. Halfway, such as 1.5, goes up, so 1.5 becomes 2. On a vector it works on each axis.',
      ['Round(1.4) is 1.', 'Round(1.5) is 2.', 'Round(1.8) is 2.'],
      'Use it to snap a count or a size to a whole metre.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  trunc: {
    usage: 'Trunc(number)',
    summary: solidScriptFunctionDocSummary(
      'Cuts off everything after the decimal point and keeps the whole part, toward zero. 1.8 becomes 1, and -1.8 becomes -1.',
      ['Trunc(1.8) is 1.', 'Trunc(-1.8) is -1.'],
      'Unlike Round Down, a negative number gets closer to zero, not more negative.',
    ),
    group: 'Math',
    gives: ['Number'],
  },
  fract: {
    usage: 'Fract(number)',
    summary: solidScriptFunctionDocSummary(
      'Keeps only the part after the decimal point, as a number from 0 up to, but not including, 1. So 1.25 becomes 0.25. A negative number still lands in that range, so -1.25 becomes 0.75. On a vector it works on each axis.',
      ['Fract(1.25) is 0.25.', 'Fract(5) is 0.', 'Fract(-1.25) is 0.75.'],
      'Use it to loop a pattern, like a repeating wave or a tile that starts over after each unit.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  sqrt: {
    usage: 'Sqrt(number)',
    summary: solidScriptFunctionDocSummary(
      'Asks what number times itself makes this. 3 times 3 is 9, so the Square Root of 9 is 3. On a vector it works on each axis.',
      ['Sqrt(9) is 3.', 'Sqrt(4) is 2.', 'Sqrt(0) is 0.'],
      'Use it with Distance or Hypot, or to ease a falloff so it softens rather than dropping in a straight line.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  pow: {
    usage: 'Pow(number, power)',
    summary: solidScriptFunctionDocSummary(
      'Multiplies a number by itself a given number of times. 2 to the power 3 is 2 × 2 × 2, which is 8. A power of 2 grows faster and faster; a power of 0.5 is a Square Root. 2 ^ 3 does the same as Pow(2, 3). On a vector it works on each axis.',
      ['Pow(2, 3) is 8.', 'Pow(9, 0.5) is 3.', 'Pow(5, 1) is 5.'],
      'Use it for a growth curve, or to sharpen or soften a falloff.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  exp: {
    usage: 'Exp(number)',
    summary: solidScriptFunctionDocSummary(
      'Raises the special growth number e ([$Math.E], about 2.718) to a power. At 0 it is 1; as the power rises, the result grows faster and faster. Natural Log undoes it. On a vector it works on each axis.',
      ['Exp(0) is 1.', 'Exp(1) is [$Math.E].'],
      'Use it for a glow or a falloff that starts gentle and then runs away, or for a growth curve.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  ln: {
    usage: 'Ln(number)',
    summary: solidScriptFunctionDocSummary(
      'Natural Log asks to what power you raise e ([$Math.E]) to get this number. It undoes E To The: together they go back and forth. The Natural Log of 1 is 0, because e to the power 0 is 1. On a vector it works on each axis.',
      ['Ln(1) is 0.', 'Ln([$Math.E]) is 1.'],
      'Use it to stretch a growth curve back into an even range, or to ease a value that has grown very large.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  min: {
    usage: 'Min(a, b, ...)',
    summary: solidScriptFunctionDocSummary(
      'Picks the smallest number from the values you give, or from one list. Two or more vectors give the lowest on each axis, such as Min([1, 5, 3], [4, 2, 6]) is [1, 2, 3].',
      ['Min(3, 1, 4) is 1.', 'Min([8, 2, 5]) is 2.'],
      'Use it to take the shorter column, the nearer point, or the tighter gap.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  max: {
    usage: 'Max(a, b, ...)',
    summary: solidScriptFunctionDocSummary(
      'Picks the biggest number from the values you give, or from one list. Two or more vectors give the highest on each axis.',
      ['Max(3, 1, 4) is 4.', 'Max([8, 2, 5]) is 8.'],
      'Use it to size a beam to the taller of two walls, or to keep a minimum thickness.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  clamp: {
    usage: 'Clamp(value, min, max)',
    summary: solidScriptFunctionDocSummary(
      'Keeps a number inside a low and a high end, like a fence. Below the low end becomes the low end, above the high end becomes the high end, and inside it stays as it is. Ends given the wrong way round are swapped.',
      ['Clamp(12, 0, 10) is 10.', 'Clamp(-3, 0, 10) is 0.', 'Clamp(7, 0, 10) is 7.', 'Clamp(12, 10, 0) is 10.'],
      'Use it so a stair height, a blend amount or a falloff never overshoots.',
    ),
    group: 'Math',
    gives: ['Number'],
  },
  between: {
    usage: 'Between(value, min, max)',
    summary: solidScriptFunctionDocSummary(
      'Yes when a number sits inside a range, including the ends, otherwise No.',
      ['Between(5, 0, 10) is Yes.', 'Between(0, 0, 10) is Yes.', 'Between(12, 0, 10) is No.'],
      'Use it to pick only the faces on one storey, or the steps in the middle of a flight.',
    ),
    group: 'Math',
    gives: ['Yes/No'],
  },
  lerp: {
    usage: 'Lerp(from, to, amount)',
    summary: solidScriptFunctionDocSummary(
      'Picks a spot between two values. 0 is the start, 1 is the end, 0.5 is halfway. Works with numbers and with points; between points the amount may be a vector, one amount per axis. Amounts outside 0 and 1 continue past the ends.',
      [
        'Lerp(0, 10, 0.5) is 5.',
        'Lerp(0, 10, 0) is 0.',
        'Lerp(Vector(0, 0, 0), Vector(0, 10, 0), 0.5) is Vector(0, 5, 0).',
        'Lerp(Vector(0, 0, 0), Vector(10, 10, 10), Vector(0, 0.5, 1)) is Vector(0, 5, 10).',
      ],
      'Use it to raise each stair a little further, to slide a point along a path, or to fade a falloff.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
  },
  smoothstep: {
    usage: 'Smoothstep(edge_low, edge_high, value)',
    summary: solidScriptFunctionDocSummary(
      'Eases from 0 to 1 between two edges, starting slowly, speeding up in the middle, then settling gently. Below the low edge it stays 0; above the high edge it stays 1.',
      ['Smoothstep(0, 10, 0) is 0.', 'Smoothstep(0, 10, 5) is 0.5.', 'Smoothstep(0, 10, 10) is 1.'],
      'Use it for a soft falloff, a gentle arch, or a fade that eases in and out.',
    ),
    group: 'Math',
    gives: ['Number'],
  },
  smootherstep: {
    usage: 'Smootherstep(edge_low, edge_high, value)',
    summary: solidScriptFunctionDocSummary(
      'Like Smoothstep but even gentler at both edges, so it starts and settles with no sudden change in speed. Below the low edge it stays 0; above the high edge it stays 1.',
      ['Smootherstep(0, 10, 0) is 0.', 'Smootherstep(0, 10, 5) is 0.5.', 'Smootherstep(0, 10, 10) is 1.'],
      'Use it for a falloff or a blend that must meet flat ground without a visible crease.',
    ),
    group: 'Math',
    gives: ['Number'],
  },
  wrap: {
    usage: 'Wrap(value, min, max)',
    summary: solidScriptFunctionDocSummary(
      'Loops a number back into a range, like going around a clock. Past the high end it starts again at the low end. On a vector it works on each axis.',
      ['Wrap(370, 0, 360) is 10.', 'Wrap(-10, 0, 360) is 350.'],
      'Use it to keep an angle in 0 to 360, or to repeat a pattern along a wall.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  equal: {
    usage: 'Equal(a, b, tolerance)',
    summary: solidScriptFunctionDocSummary(
      'Yes when two numbers are at most Tolerance apart, 0.001 when left off; vectors match axis by axis. == already allows 0.001, so 0.1 + 0.2 == 0.3; Equal lets you choose how close is close enough.',
      ['Equal(1, 1.2, 0.5) is Yes.', 'Equal(1, 1.2, 0.1) is No.', 'Equal([0, 0.99, 0], [0, 1, 0], 0.05) is Yes.'],
      'Use it for rotated or measured values that are almost, but not exactly, the same.',
    ),
    group: 'Math',
    gives: ['Yes/No'],
  },
  mod: {
    usage: 'Mod(a, b)',
    summary: solidScriptFunctionDocSummary(
      'The leftover after you divide, always zero or above. After you pass the second number you start over, like going around a clock. On a vector it works on each axis.',
      ['Mod(7, 5) is 2.', 'Mod(10, 5) is 0.', 'Mod(-1, 5) is 4.'],
      'Use it to repeat every Nth step, or to wrap a tile pattern. The % sign is a bit different: it keeps the minus, so -1 % 5 is -1.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  snap: {
    usage: 'Snap(value, step)',
    summary: solidScriptFunctionDocSummary(
      'Rounds a number to the nearest step, like a grid. With step 5, 13 sits closer to 15 than to 10. On a vector it works on each axis.',
      ['Snap(13, 5) is 15.', 'Snap(12, 5) is 10.', 'Snap(1.2, 0.5) is 1.'],
      'Use it to snap a wall or a stair to a grid, or to keep sizes on a 0.25 metre module.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  hypot: {
    usage: 'Hypot(a, b, ...)',
    summary: solidScriptFunctionDocSummary(
      'The straight-line length of a path that goes these amounts along each side. Walk 3 steps east and 4 steps north, and the diagonal is 5. Give two sides for a floor, or three for a room.',
      ['Hypot(3, 4) is 5.', 'Hypot(0, 3, 4) is 5.'],
      'Use it for the radius of an arch, a distance on a floor plan, or how far a point is from the origin. Distance does this for two points.',
    ),
    group: 'Math',
    gives: ['Number'],
  },
  sum: {
    usage: 'Sum(list)',
    summary: solidScriptFunctionDocSummary(
      'Adds every number in a list.',
      ['Sum([1, 2, 3]) is 6.', 'Sum([10, 20, 30]) is 60.'],
      'Use it for a total run of stairs or the combined length of a path.',
    ),
    group: 'Math',
    gives: ['Number'],
  },
  average: {
    usage: 'Average(list)',
    summary: solidScriptFunctionDocSummary(
      'The middle value of the numbers in a list: add them up and divide by how many there are.',
      ['Average([2, 4, 6]) is 4.', 'Average([10, 20, 30]) is 20.'],
      'Use it for even spacing, or a typical step height.',
    ),
    group: 'Math',
    gives: ['Number'],
  },
  norm: {
    usage: 'Norm(vector)',
    summary: solidScriptFunctionDocSummary(
      'How far a vector reaches from its start, like the length of an arrow. Norm and Length do the same thing.',
      ['Norm(Vector(3, 4, 0)) is 5.', 'Norm(Vector(0, 2, 0)) is 2.'],
      'Use it to measure a step or a beam, or to scale a move to a set distance.',
    ),
    group: 'Vector',
    gives: ['Number'],
  },
  length: {
    usage: 'Length(vector)',
    summary: solidScriptFunctionDocSummary(
      'How far a vector reaches from its start, like the length of an arrow. Length and Norm do the same thing.',
      ['Length(Vector(3, 4, 0)) is 5.', 'Length(Vector(0, 2, 0)) is 2.'],
      'Use it to measure a step or a beam, or to scale a move to a set distance.',
    ),
    group: 'Vector',
    gives: ['Number'],
  },
  normalize: {
    usage: 'Normalize(vector)',
    summary: solidScriptFunctionDocSummary(
      'Keeps the direction of a vector but makes its length exactly 1, so you can move a set distance that way. A zero vector has no direction, so it cannot be normalized.',
      ['Normalize(Vector(0, 4, 0)) is Vector(0, 1, 0).', 'Normalize(Vector(3, 0, 0)) is Vector(1, 0, 0).'],
      'Use it to step along a path, or to push a wall out by one metre.',
    ),
    group: 'Vector',
    gives: ['Vector'],
  },
  dot: {
    usage: 'Dot(a, b)',
    summary: solidScriptFunctionDocSummary(
      'Says how much two directions point the same way. 0 means they meet at a right angle, a positive number means they lean the same way, and a negative number means they face opposite ways.',
      [
        'Dot(Vector(1, 0, 0), Vector(0, 1, 0)) is 0.',
        'Dot(Vector(2, 0, 0), Vector(3, 0, 0)) is 6.',
        'Dot(Vector(1, 0, 0), Vector(-1, 0, 0)) is -1.',
      ],
      'Use it to see if a face looks toward a light, or if two paths run along each other.',
    ),
    group: 'Vector',
    gives: ['Number'],
  },
  cross: {
    usage: 'Cross(a, b)',
    summary: solidScriptFunctionDocSummary(
      'Gives a new direction that stands straight out from both, like the way a floor faces when you know two of its edges.',
      [
        'Cross(Vector(1, 0, 0), Vector(0, 1, 0)) is Vector(0, 0, 1).',
        'Cross(Vector(0, 1, 0), Vector(0, 0, 1)) is Vector(1, 0, 0).',
      ],
      'Use it to find the facing of a surface, or the axis to spin around.',
    ),
    group: 'Vector',
    gives: ['Vector'],
  },
  distance: {
    usage: 'Distance(a, b)',
    summary: solidScriptFunctionDocSummary(
      'How far apart two points are, in a straight line. The same idea as Hypot, but you give two points instead of the sides.',
      ['Distance(Vector(0, 0, 0), Vector(0, 3, 4)) is 5.', 'Distance(Vector(1, 0, 0), Vector(1, 0, 0)) is 0.'],
      'Use it for a falloff from a lamp, the length of a beam, or how close a point is to a doorway.',
    ),
    group: 'Vector',
    gives: ['Number'],
  },
  vector: {
    usage: 'Vector(x, y, z)',
    summary: solidScriptFunctionDocSummary(
      'Makes a point or a direction from three numbers: X (right), Y (up) and Z (forward). Leave off Z for a flat point, since [x, y] is the same as [x, y, 0]; one number is that number on every axis. You can also write 0, 2, 0 in a Vector field.',
      ['Vector(0, 2, 0) is [0, 2, 0].', 'Vector(1, 2) is [1, 2, 0].', 'Vector(1) is [1, 1, 1].'],
      'Use it to name a point, a size or a direction you want to pass into other blocks.',
    ),
    group: 'Vector',
    gives: ['Vector'],
  },
  rotate_vector: {
    usage: 'RotateVector(vector, axis, degrees, center)',
    summary: solidScriptFunctionDocSummary(
      'Turns a point or a direction around an axis, like rotating a handle around a pole. A quarter turn around up sends a point that was on the right around to the back. Center, when given, is the point the axis goes through; left off it is 0, 0, 0.',
      [
        'RotateVector(Vector(1, 0, 0), Vector(0, 1, 0), 90) turns a point on the right around to the back.',
        'RotateVector(Vector(1, 0, 0), Vector(0, 1, 0), 0) is Vector(1, 0, 0).',
        'RotateVector(Vector(0, 2, 0), Vector(0, 1, 0), 90) is Vector(0, 2, 0).',
        'RotateVector(Vector(2, 0, 0), Vector(0, 1, 0), 180, Vector(1, 0, 0)) turns around the point 1, 0, 0 to Vector(0, 0, 0).',
      ],
      'Use it to walk a spiral, to swing a door, or to spin a detail around a column.',
    ),
    group: 'Vector',
    gives: ['Vector'],
  },
  angle: {
    usage: 'Angle(a, b)',
    summary: solidScriptFunctionDocSummary(
      'The turn in degrees between two directions, from 0 (they line up) to 180 (they face opposite ways).',
      [
        'Angle(Vector(1, 0, 0), Vector(0, 1, 0)) is 90.',
        'Angle(Vector(1, 0, 0), Vector(1, 0, 0)) is 0.',
        'Angle(Vector(1, 0, 0), Vector(-1, 0, 0)) is 180.',
      ],
      'Use it to see how sharp a corner is, or how far a door has swung. To ask whether two directions are within some degrees of each other, Facing does it in one step.',
    ),
    group: 'Vector',
    gives: ['Number'],
  },
  project_on_plane: {
    usage: 'ProjectOnPlane(point, through, normal)',
    summary: solidScriptFunctionDocSummary(
      'Drops a point straight onto a flat plane, like a shadow falling at a right angle. The plane goes through one point (Through) and faces a direction (Normal), which is the way the surface points.',
      [
        'ProjectOnPlane(Vector(0, 2, 0), Vector(0, 0, 0), Vector(0, 1, 0)) is Vector(0, 0, 0).',
        'ProjectOnPlane(Vector(3, 5, 1), Vector(0, 0, 0), Vector(0, 1, 0)) is Vector(3, 0, 1).',
      ],
      'Use it to flatten a point onto the floor, or to find where a post meets a wall.',
    ),
    group: 'Vector',
    gives: ['Vector'],
  },
  project_onto: {
    usage: 'ProjectOnto(vector, direction)',
    summary: solidScriptFunctionDocSummary(
      'Keeps only the part of a vector that points along a direction, like the length of a shadow cast along a line.',
      [
        'ProjectOnto(Vector(2, 3, 0), Vector(1, 0, 0)) is Vector(2, 0, 0).',
        'ProjectOnto(Vector(2, 2, 0), Vector(0, 0, 5)) is Vector(0, 0, 0).',
      ],
      'Use it to measure how far a point lies along a wall, or to slide a move along one axis only.',
    ),
    group: 'Vector',
    gives: ['Vector'],
  },
  reflect: {
    usage: 'Reflect(vector, normal)',
    summary: solidScriptFunctionDocSummary(
      'Bounces a direction off a surface, like a ball off a wall. The surface faces the Normal you give, which is the way the wall points.',
      ['Reflect(Vector(1, -1, 0), Vector(0, 1, 0)) is Vector(1, 1, 0).'],
      'Use it for a bounced path, or to flip a direction to the other side of a wall.',
    ),
    group: 'Vector',
    gives: ['Vector'],
  },
} as const satisfies Partial<Record<SolidScriptBuiltinName, SolidScriptFunctionDoc>>;
