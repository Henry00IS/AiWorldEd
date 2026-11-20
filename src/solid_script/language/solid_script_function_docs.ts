import type { SOLID_SCRIPT_KINDS } from './solid_script_kinds.js';
import type { SolidScriptBuiltinName } from './solid_script_functions_builtin.js';
import {
  SOLID_SCRIPT_CONDITION_HELPER_ARGUMENTS,
  SOLID_SCRIPT_CONDITION_HELPER_DOCS,
} from './solid_script_condition_helpers.js';
import {
  SOLID_SCRIPT_KIND_CHECK_ARGUMENTS,
  SOLID_SCRIPT_KIND_CHECK_DOCS,
} from './solid_script_functions_kind_checks.js';
/** A kind of value the editor checks name, such as Face or Face List. */
export type SolidScriptKindName = (typeof SOLID_SCRIPT_KINDS)[number] | `${(typeof SOLID_SCRIPT_KINDS)[number]} List`;

/** Kinds of value a function takes or gives; Any for any value. */
export type SolidScriptFunctionKinds = 'Any' | readonly SolidScriptKindName[];

/**
 * Names kinds for people, such as Number or Vector.
 *
 * @param kinds Kinds.
 * @returns Kinds in words.
 */
export function solidScriptFunctionKindsText(kinds: SolidScriptFunctionKinds): string {
  return kinds === 'Any' ? 'Any' : kinds.join(' or ');
}

/** How to call one built-in function and what it gives. */
export interface SolidScriptFunctionDoc {
  /** Call with its inputs, such as pad_left(text, width, fill). */
  usage: string;
  /** What it gives, in one short sentence. */
  summary: string;
  /**
   * Kinds of value it gives, read by the editor checks; Any when only running
   * tells.
   */
  gives: SolidScriptFunctionKinds;
  /**
   * For a check such as IsNum: the kinds it says Yes for, so the editor checks
   * know them inside an If that asks it; List stands for every list.
   */
  checks?: readonly SolidScriptKindName[];
  /** Group in the reference. */
  group: 'Math' | 'Angles' | 'Vectors' | 'Text' | 'Lists' | 'Checks' | 'Random' | 'Time' | 'Curves';
}

/**
 * Every built-in function of formulas, by name: the TypeScript type makes a
 * function without its kinds fail to build.
 */
const SOLID_SCRIPT_FUNCTION_DOCS_NAMED: Readonly<Record<SolidScriptBuiltinName, SolidScriptFunctionDoc>> = {
  sin: {
    usage: 'Sin(degrees)',
    summary: 'Sine of an angle in degrees, such as Sin(90) is 1.',
    group: 'Angles',
    gives: ['Number'],
  },
  cos: {
    usage: 'Cos(degrees)',
    summary: 'Cosine of an angle in degrees, such as Cos(0) is 1.',
    group: 'Angles',
    gives: ['Number'],
  },
  tan: {
    usage: 'Tan(degrees)',
    summary: 'Tangent of an angle in degrees, such as Tan(45) is 1.',
    group: 'Angles',
    gives: ['Number'],
  },
  asin: {
    usage: 'Asin(value)',
    summary: 'Angle in degrees whose sine is the value, such as Asin(1) is 90.',
    group: 'Angles',
    gives: ['Number'],
  },
  acos: {
    usage: 'Acos(value)',
    summary: 'Angle in degrees whose cosine is the value, such as Acos(1) is 0.',
    group: 'Angles',
    gives: ['Number'],
  },
  atan: {
    usage: 'Atan(value)',
    summary: 'Angle in degrees whose tangent is the value, such as Atan(1) is 45.',
    group: 'Angles',
    gives: ['Number'],
  },
  atan2: {
    usage: 'Atan2(y, x)',
    summary: 'Angle in degrees from the X axis to the point x, y, such as Atan2(1, 0) is 90.',
    group: 'Angles',
    gives: ['Number'],
  },
  radians: {
    usage: 'Radians(degrees)',
    summary: 'Turns degrees into radians, such as Radians(180) is PI.',
    group: 'Angles',
    gives: ['Number'],
  },
  degrees: {
    usage: 'Degrees(radians)',
    summary: 'Turns radians into degrees, such as Degrees(PI) is 180.',
    group: 'Angles',
    gives: ['Number'],
  },
  abs: {
    usage: 'Abs(number)',
    summary: 'The number without its minus sign, such as Abs(-3) is 3.',
    group: 'Math',
    gives: ['Number'],
  },
  sign: {
    usage: 'Sign(number)',
    summary: '-1, 0 or 1 for below, at or above 0, such as Sign(-4) is -1.',
    group: 'Math',
    gives: ['Number'],
  },
  ceil: {
    usage: 'Ceil(number)',
    summary: 'Rounds up to a whole number, such as Ceil(1.2) is 2.',
    group: 'Math',
    gives: ['Number'],
  },
  floor: {
    usage: 'Floor(number)',
    summary: 'Rounds down to a whole number, such as Floor(1.8) is 1.',
    group: 'Math',
    gives: ['Number'],
  },
  round: {
    usage: 'Round(number)',
    summary: 'Rounds to the nearest whole number, such as Round(1.5) is 2.',
    group: 'Math',
    gives: ['Number'],
  },
  trunc: {
    usage: 'Trunc(number)',
    summary: 'Drops what is after the decimal point, such as Trunc(1.8) is 1.',
    group: 'Math',
    gives: ['Number'],
  },
  fract: {
    usage: 'Fract(number)',
    summary: 'Only what is after the decimal point, 0 to 1, such as Fract(1.25) is 0.25.',
    group: 'Math',
    gives: ['Number'],
  },
  sqrt: { usage: 'Sqrt(number)', summary: 'Square root, such as Sqrt(9) is 3.', group: 'Math', gives: ['Number'] },
  pow: {
    usage: 'Pow(number, power)',
    summary: 'The number to a power, such as Pow(2, 3) is 8; a ^ b does the same.',
    group: 'Math',
    gives: ['Number'],
  },
  exp: {
    usage: 'Exp(number)',
    summary: 'e to the power of the number, such as Exp(0) is 1.',
    group: 'Math',
    gives: ['Number'],
  },
  ln: { usage: 'Ln(number)', summary: 'Natural logarithm, such as Ln(1) is 0.', group: 'Math', gives: ['Number'] },
  log: {
    usage: 'Log(number)',
    summary: 'Logarithm with base 10, such as Log(100) is 2.',
    group: 'Math',
    gives: ['Number'],
  },
  min: {
    usage: 'Min(a, b, ...)',
    summary: 'The smallest number, of the inputs or of one list, such as Min(3, 1, 4) is 1.',
    group: 'Math',
    gives: ['Number'],
  },
  max: {
    usage: 'Max(a, b, ...)',
    summary: 'The biggest number, of the inputs or of one list, such as Max(3, 1, 4) is 4.',
    group: 'Math',
    gives: ['Number'],
  },
  clamp: {
    usage: 'Clamp(value, min, max)',
    summary: 'Keeps a number between min and max, such as Clamp(12, 0, 10) is 10.',
    group: 'Math',
    gives: ['Number'],
  },
  between: {
    usage: 'Between(value, min, max)',
    summary: 'Yes when the number is from min to max, such as Between(5, 0, 10).',
    group: 'Math',
    gives: ['Yes/No'],
  },
  lerp: {
    usage: 'Lerp(from, to, amount)',
    summary: 'The way from one number or vector to another, such as Lerp(0, 10, 0.5) is 5.',
    group: 'Math',
    gives: ['Number', 'Vector'],
  },
  remap: {
    usage: 'Remap(value, from_low, from_high, to_low, to_high)',
    summary: 'Moves a number from one range into another, such as Remap(5, 0, 10, 0, 100) is 50.',
    group: 'Math',
    gives: ['Number'],
  },
  smoothstep: {
    usage: 'Smoothstep(edge_low, edge_high, value)',
    summary: 'Eases from 0 to 1 between the edges, such as SmoothStep(0, 1, 0.5) is 0.5.',
    group: 'Math',
    gives: ['Number'],
  },
  wrap: {
    usage: 'Wrap(value, min, max)',
    summary: 'Goes round within a range, such as Wrap(370, 0, 360) is 10.',
    group: 'Math',
    gives: ['Number'],
  },
  mod: {
    usage: 'Mod(a, b)',
    summary:
      'Rest after dividing, never below 0, such as Mod(-1, 5) is 4. The % operator is the signed remainder, such as 5 % 2 is 1.',
    group: 'Math',
    gives: ['Number'],
  },
  snap: {
    usage: 'Snap(value, step)',
    summary: 'Rounds to the nearest step, such as 0.25.',
    group: 'Math',
    gives: ['Number'],
  },
  hypot: {
    usage: 'Hypot(a, b, ...)',
    summary: 'Length of the line with these sides, such as Hypot(3, 4) is 5.',
    group: 'Math',
    gives: ['Number'],
  },
  sum: {
    usage: 'Sum(list)',
    summary: 'All numbers of a list added up, such as Sum($[1, 2, 3$]) is 6.',
    group: 'Math',
    gives: ['Number'],
  },
  average: {
    usage: 'Average(list)',
    summary: 'The mean of the numbers of a list, such as Average($[2, 4, 6$]) is 4.',
    group: 'Math',
    gives: ['Number'],
  },
  norm: {
    usage: 'Norm(vector)',
    summary: 'Length of a vector, such as Length(Vector(3, 4, 0)) is 5.',
    group: 'Vectors',
    gives: ['Number'],
  },
  length: {
    usage: 'Length(vector)',
    summary: 'Length of a vector, such as Length(Vector(3, 4, 0)) is 5.',
    group: 'Vectors',
    gives: ['Number'],
  },
  normalize: {
    usage: 'Normalize(vector)',
    summary: 'The direction of a vector, with length 1, such as Normalize(Vector(0, 4, 0)) is Vector(0, 1, 0).',
    group: 'Vectors',
    gives: ['Vector'],
  },
  dot: {
    usage: 'Dot(a, b)',
    summary: 'Dot product of two vectors, such as Dot(Vector(1, 0, 0), Vector(0, 1, 0)) is 0.',
    group: 'Vectors',
    gives: ['Number'],
  },
  cross: {
    usage: 'Cross(a, b)',
    summary: 'Vector at right angles to both, such as Cross(Vector(1, 0, 0), Vector(0, 1, 0)) is Vector(0, 0, 1).',
    group: 'Vectors',
    gives: ['Vector'],
  },
  distance: {
    usage: 'Distance(a, b)',
    summary: 'How far apart two points are, such as Distance(Vector(0, 0, 0), Vector(0, 3, 4)) is 5.',
    group: 'Vectors',
    gives: ['Number'],
  },
  vector: {
    usage: 'Vector(x, y, z)',
    summary: 'Makes a vector from numbers, such as Vector(0, 2, 0).',
    group: 'Vectors',
    gives: ['Vector'],
  },
  str: {
    usage: 'Str(a, b, ...)',
    summary: 'Joins values into one text, such as Str(3, x) is 3x.',
    group: 'Text',
    gives: ['Text'],
  },
  uppercase: {
    usage: 'Uppercase(text)',
    summary: 'TEXT IN CAPITALS, such as Uppercase(hi) is HI.',
    group: 'Text',
    gives: ['Text'],
  },
  lowercase: {
    usage: 'Lowercase(text)',
    summary: 'text in small letters, such as Lowercase(Hi) is hi.',
    group: 'Text',
    gives: ['Text'],
  },
  capitalize: {
    usage: 'Capitalize(text)',
    summary: 'First letter as a capital, such as Capitalize(hello) is Hello.',
    group: 'Text',
    gives: ['Text'],
  },
  title_case: {
    usage: 'TitleCase(text)',
    summary: 'Every Word Starts With A Capital, such as TitleCase(hello world) is Hello World.',
    group: 'Text',
    gives: ['Text'],
  },
  trim: {
    usage: 'Trim(text)',
    summary: 'Drops spaces at both ends, such as Trim of a padded word keeps the word.',
    group: 'Text',
    gives: ['Text'],
  },
  trim_start: {
    usage: 'TrimStart(text)',
    summary: 'Drops spaces at the start, such as TrimStart of a padded word keeps the trailing spaces.',
    group: 'Text',
    gives: ['Text'],
  },
  trim_end: {
    usage: 'TrimEnd(text)',
    summary: 'Drops spaces at the end, such as TrimEnd of a padded word keeps the leading spaces.',
    group: 'Text',
    gives: ['Text'],
  },
  pad_left: {
    usage: 'PadLeft(text, width, fill)',
    summary: 'Fills in front up to a width, such as PadLeft(7, 3, 0) is 007.',
    group: 'Text',
    gives: ['Text'],
  },
  pad_right: {
    usage: 'PadRight(text, width, fill)',
    summary: 'Fills behind up to a width, such as PadRight(7, 3, 0) is 700.',
    group: 'Text',
    gives: ['Text'],
  },
  contains: {
    usage: 'Contains(text, part)',
    summary: 'Yes when the text holds the part, such as Contains(hello, ell).',
    group: 'Text',
    gives: ['Yes/No'],
  },
  starts_with: {
    usage: 'StartsWith(text, part)',
    summary: 'Yes when the text starts with the part, such as StartsWith(hello, he).',
    group: 'Text',
    gives: ['Yes/No'],
  },
  ends_with: {
    usage: 'EndsWith(text, part)',
    summary: 'Yes when the text ends with the part, such as EndsWith(hello, lo).',
    group: 'Text',
    gives: ['Yes/No'],
  },
  position: {
    usage: 'Position(text, part)',
    summary: 'Where the part starts, from 0, or -1, such as Find(hello, ell) is 1.',
    group: 'Text',
    gives: ['Number'],
  },
  count_text: {
    usage: 'CountText(text, part)',
    summary: 'How often the part is in the text, such as CountText(abab, ab) is 2.',
    group: 'Text',
    gives: ['Number'],
  },
  character_code: {
    usage: 'CharacterCode(text)',
    summary: 'The number of the first character, such as CharacterCode(A) is 65.',
    group: 'Text',
    gives: ['Number'],
  },
  character: {
    usage: 'Character(code)',
    summary: 'The character of a number, such as Character(65) is A.',
    group: 'Text',
    gives: ['Text'],
  },
  part: {
    usage: 'Part(text, start, count)',
    summary: 'A piece of the text, from 0, such as Part(hello, 1, 3) is ell.',
    group: 'Text',
    gives: ['Text'],
  },
  replace: {
    usage: 'Replace(text, find, with)',
    summary: 'Replaces every copy of a part, such as Replace(hello, l, r) is herro.',
    group: 'Text',
    gives: ['Text'],
  },
  replace_pattern: {
    usage: 'ReplacePattern(text, pattern, with)',
    summary: 'Replaces what matches a pattern, such as a digit pattern with X.',
    group: 'Text',
    gives: ['Text'],
  },
  find_pattern: {
    usage: 'FindPattern(text, pattern)',
    summary: 'List of what matches a pattern, such as the digits in a text.',
    group: 'Text',
    gives: ['List'],
  },
  repeat_text: {
    usage: 'RepeatText(text, times)',
    summary: 'The text several times, such as RepeatText(ha, 3) is hahaha.',
    group: 'Text',
    gives: ['Text'],
  },
  reversed: {
    usage: 'Reversed(text or list)',
    summary: 'Back to front, such as Reversed(abc) is cba.',
    group: 'Text',
    gives: ['Text', 'List'],
  },
  split: {
    usage: 'Split(text, separator)',
    summary: 'List of the pieces between separators, such as Split(a,b,c, a comma) is a, b and c.',
    group: 'Text',
    gives: ['List'],
  },
  join: {
    usage: 'Join(list, separator)',
    summary: 'One text from the items of a list, such as Join($[a, b$], and ) is a and b.',
    group: 'Text',
    gives: ['Text'],
  },
  characters: {
    usage: 'Characters(text)',
    summary: 'List of the single letters, such as Characters(hi) is h and i.',
    group: 'Text',
    gives: ['List'],
  },
  lines: {
    usage: 'Lines(text)',
    summary: 'List of the lines of a text, such as Lines of two lines is a list of two items.',
    group: 'Text',
    gives: ['List'],
  },
  parse: {
    usage: 'Parse(text)',
    summary:
      'Reads text like a typed field, with its brackets, vectors, lists and math, such as Parse of 4, 5, 5 is a vector and Parse of 5+5 is 10.',
    group: 'Text',
    gives: 'Any',
  },
  number: {
    usage: 'Number(text)',
    summary: 'Reads text as a number, such as Number(12) is 12.',
    group: 'Text',
    gives: ['Number'],
  },
  format_number: {
    usage: 'FormatNumber(number, decimals, thousands)',
    summary: 'Writes a number with decimals and a thousands mark, such as NumberText(1234.5, 2) is 1,234.50.',
    group: 'Text',
    gives: ['Text'],
  },
  time_text: {
    usage: 'TimeText(seconds, pattern)',
    summary: 'Writes a time with YYYY MM DD HH mm ss, such as $Time.Now.',
    group: 'Time',
    gives: ['Text'],
  },
  len: {
    usage: 'Len(list or text)',
    summary: 'How many items or letters, such as Len(hello) is 5.',
    group: 'Lists',
    gives: ['Number'],
  },
  concat: {
    usage: 'Concat(a, b, ...)',
    summary: 'One list from lists and values, such as Concat($[1$], $[2$]) is 1 and 2.',
    group: 'Lists',
    gives: ['List'],
  },
  lookup: {
    usage: 'Lookup(key, table)',
    summary: 'Value between the rows of a key table, such as Lookup(5, a table of keys and values).',
    group: 'Lists',
    gives: ['Number'],
  },
  first: {
    usage: 'First(list)',
    summary: 'The first item, such as First($[a, b, c$]) is a.',
    group: 'Lists',
    gives: 'Any',
  },
  last: {
    usage: 'Last(list)',
    summary: 'The last item, such as Last($[a, b, c$]) is c.',
    group: 'Lists',
    gives: 'Any',
  },
  slice: {
    usage: 'Slice(list, start, count)',
    summary: 'Some items, from 0, such as Slice($[a, b, c$], 1, 2) is b and c.',
    group: 'Lists',
    gives: ['List'],
  },
  item_or: {
    usage: 'ItemOr(list, index, fallback)',
    summary: 'The item at an index, from 0, or the fallback when there is none, such as ItemOr($[1, 2$], 5, 0) is 0.',
    group: 'Lists',
    gives: 'Any',
  },
  index_of: {
    usage: 'IndexOf(list, value)',
    summary: 'Where a value is, from 0, or -1, such as IndexOf($[a, b$], b) is 1.',
    group: 'Lists',
    gives: ['Number'],
  },
  unique: {
    usage: 'Unique(list)',
    summary: 'The list without repeats, such as Unique($[1, 1, 2$]) is 1 and 2.',
    group: 'Lists',
    gives: ['List'],
  },
  sorted: {
    usage: 'Sorted(list)',
    summary: 'A sorted copy: numbers small to big, words A to Z, such as Sorted($[3, 1, 2$]) is 1, 2, 3.',
    group: 'Lists',
    gives: ['List'],
  },
  pick: {
    usage: 'Pick(number, first, second, ...)',
    summary: 'The value at a position, from 0, such as Pick(1, a, b, c) is b.',
    group: 'Lists',
    gives: 'Any',
  },
  is_undef: {
    usage: 'IsUndef(value)',
    summary: 'Yes when there is no value, such as IsUndef of a name that was never set.',
    group: 'Checks',
    gives: ['Yes/No'],
  },
  is_num: {
    usage: 'IsNum(value)',
    summary: 'Yes for a number, such as IsNum(3).',
    group: 'Checks',
    gives: ['Yes/No'],
    checks: ['Number'],
  },
  is_list: {
    usage: 'IsList(value)',
    summary: 'Yes for a list or vector, such as IsList($[1, 2$]).',
    group: 'Checks',
    gives: ['Yes/No'],
    checks: ['List', 'Vector'],
  },
  is_string: {
    usage: 'IsString(value)',
    summary: 'Yes for text, such as IsString(hello).',
    group: 'Checks',
    gives: ['Yes/No'],
    checks: ['Text'],
  },
  is_bool: {
    usage: 'IsBool(value)',
    summary: 'Yes for Yes or No, such as IsBool(Yes).',
    group: 'Checks',
    gives: ['Yes/No'],
    checks: ['Yes/No'],
  },
  curve_at: {
    usage: 'CurveAt(curve, x)',
    summary: 'Height of a curve at x, from 0 to 1, such as CurveAt([Profile], 0.5).',
    group: 'Curves',
    gives: ['Number'],
  },
  path_length: {
    usage: 'PathLength(points)',
    summary: 'Length of a path through points, such as PathLength([Path]).',
    group: 'Curves',
    gives: ['Number'],
  },
  resample: {
    usage: 'Resample(points, count)',
    summary: 'Count points evenly spaced along a path, from its start to its end, such as Resample([Path], 8).',
    group: 'Curves',
    gives: ['List'],
  },
  profile_points: {
    usage: 'ProfilePoints(curve, height, radius)',
    summary:
      'A profile as [height, radius] points, like a column samples it, such as ProfilePoints([Profile], 2, 0.5).',
    group: 'Curves',
    gives: ['List'],
  },
  random: {
    usage: 'Random(min, max, seed)',
    summary:
      'A random number or vector; one seed gives one result, such as Random(0, 1, 1). For a yes-or-no chance, use Random(0, 1, seed) < 0.3.',
    group: 'Random',
    gives: ['Number', 'Vector'],
  },
  rands: {
    usage: 'Rands(min, max, count, seed)',
    summary: 'A list of random numbers, such as Rands(0, 1, 4, 1).',
    group: 'Random',
    gives: ['List'],
  },
  hash: {
    usage: 'Hash(value, seed)',
    summary: 'A number from 0 to 1 that is always the same for the same value and seed, such as Hash(Wall, 1).',
    group: 'Random',
    gives: ['Number'],
  },
  noise: {
    usage: 'Noise(x, y, z, scale, seed)',
    summary:
      'Smooth random bumps from 0 to 1 at a point; one seed gives the same field, such as Noise(Vector(1, 0, 0), 1, 4).',
    group: 'Random',
    gives: ['Number'],
  },
  shuffle: {
    usage: 'Shuffle(list, seed)',
    summary: 'The items of a list in a random order; one seed gives the same order, such as Shuffle($[1, 2, 3$], 1).',
    group: 'Random',
    gives: ['List'],
  },
  nearest: {
    usage: 'Nearest(points, point)',
    summary: 'Index of the closest point in a list, from 0, such as ClosestPoint(Vector(0, 0, 0), [Points]).',
    group: 'Random',
    gives: ['Number'],
  },
  path_at: {
    usage: 'PathAt(points, amount)',
    summary: 'The point at a fraction of a path: 0 is the start, 1 is the end, such as PathAt([Path], 0.5).',
    group: 'Curves',
    gives: ['Vector'],
  },
  path_direction: {
    usage: 'PathDirection(points, amount)',
    summary: 'The way a path faces at a fraction of its length, such as PathDirection([Path], 0.5).',
    group: 'Curves',
    gives: ['Vector'],
  },
  trim_path: {
    usage: 'TrimPath(points, start, end)',
    summary: 'The part of a path from one fraction of its length to another, such as TrimPath([Path], 0.25, 0.75).',
    group: 'Curves',
    gives: ['List'],
  },
  rotate_vector: {
    usage: 'RotateVector(vector, axis, degrees)',
    summary:
      'Turns a vector around an axis by an angle in degrees, such as RotateVector(Vector(1, 0, 0), Vector(0, 1, 0), 90).',
    group: 'Vectors',
    gives: ['Vector'],
  },
  angle: {
    usage: 'Angle(a, b)',
    summary: 'The angle in degrees between two vectors, such as Angle(Vector(1, 0, 0), Vector(0, 1, 0)) is 90.',
    group: 'Vectors',
    gives: ['Number'],
  },
  project: {
    usage: 'Project(point, through, normal)',
    summary:
      'The closest point on the plane through Through, facing Normal, such as Project(Vector(0, 2, 0), Vector(0, 0, 0), Vector(0, 1, 0)) is Vector(0, 0, 0).',
    group: 'Vectors',
    gives: ['Vector'],
  },
  reflect: {
    usage: 'Reflect(vector, normal)',
    summary: 'The vector bounced off the plane that faces Normal, such as Reflect(Vector(1, -1, 0), Vector(0, 1, 0)).',
    group: 'Vectors',
    gives: ['Vector'],
  },
  ...SOLID_SCRIPT_CONDITION_HELPER_DOCS,
  ...SOLID_SCRIPT_KIND_CHECK_DOCS,
  hits: {
    usage: 'Hits(element, target, how)',
    summary:
      'Yes when the box of an element meets the box of another brush, mesh, face, edge, vertex, point, or any item of a list, such as Hits([$Brush], [Wall]). How is Touching (any contact, including sitting inside), Overlapping (they share interior space) or Fully Inside. Touching when How is left off.',
    group: 'Checks',
    gives: ['Yes/No'],
  },
  hits_box: {
    usage: 'HitsBox(element, center, size, how)',
    summary:
      'Yes when the box of an element meets a box of a Center and Size, such as HitsBox([$Brush], Vector(0, 0, 0), 2). How is Touching, Overlapping or Fully Inside. Touching when How is left off.',
    group: 'Checks',
    gives: ['Yes/No'],
  },
};

/** Every built-in function of formulas with its kinds, by name. */
export const SOLID_SCRIPT_FUNCTION_DOCS: Readonly<Record<string, SolidScriptFunctionDoc>> =
  SOLID_SCRIPT_FUNCTION_DOCS_NAMED;

/** One input of a function: its name, the kind of value and what it is for. */
export interface SolidScriptFunctionArgument {
  /** Name as the usage writes it, such as from_low or "...". */
  name: string;
  /** Kinds of value it takes, read by the editor checks and a running formula. */
  type: SolidScriptFunctionKinds;
  /** What it is for, in one short sentence. */
  about: string;
}

/** Kind and meaning of the inputs by name, shared by the functions using it. */
const SOLID_SCRIPT_FUNCTION_ARGUMENTS: Readonly<Record<string, Omit<SolidScriptFunctionArgument, 'name'>>> = {
  '...': { type: 'Any', about: 'More values, as many as needed.' },
  a: { type: ['Number'], about: 'The first number.' },
  b: { type: ['Number'], about: 'The second number.' },
  amount: { type: ['Number'], about: 'How far along: 0 is From, 1 is To.' },
  code: { type: ['Number'], about: 'Character number, such as 65 for A.' },
  count: { type: ['Number'], about: 'How many.' },
  curve: { type: 'Any', about: 'A curve, such as a curve Input.' },
  decimals: { type: ['Number'], about: 'Digits after the decimal point.' },
  degrees: { type: ['Number'], about: 'Angle in degrees.' },
  edge_high: { type: ['Number'], about: 'Where the result reaches 1.' },
  edge_low: { type: ['Number'], about: 'Where the result starts to rise above 0.' },
  fallback: { type: 'Any', about: 'What it gives when there is no such item.' },
  fill: { type: ['Text'], about: 'Character to fill with, such as "0".' },
  find: { type: ['Text'], about: 'The part to replace.' },
  first: { type: 'Any', about: 'Value at position 0.' },
  from: { type: ['Number', 'Vector'], about: 'Where the way starts.' },
  from_high: { type: ['Number'], about: 'High end of the range the value is in.' },
  from_low: { type: ['Number'], about: 'Low end of the range the value is in.' },
  height: { type: ['Number'], about: 'Height of the profile.' },
  index: { type: ['Number'], about: 'Position, from 0.' },
  key: { type: ['Number'], about: 'The value to look up.' },
  list: { type: ['List'], about: 'A list.' },
  'list or text': { type: ['List', 'Text'], about: 'A list or a text.' },
  max: { type: ['Number'], about: 'The highest value.' },
  min: { type: ['Number'], about: 'The lowest value.' },
  number: { type: ['Number'], about: 'A number.' },
  part: { type: ['Text'], about: 'The piece of text to look for.' },
  pattern: { type: ['Text'], about: 'Pattern the text is matched against.' },
  points: { type: ['List'], about: 'The points of a path.' },
  power: { type: ['Number'], about: 'The power to raise to.' },
  radians: { type: ['Number'], about: 'Angle in radians.' },
  radius: { type: ['Number'], about: 'Radius of the profile.' },
  second: { type: 'Any', about: 'Value at position 1.' },
  seconds: { type: ['Number'], about: 'A time in seconds, such as $Time.Now.' },
  seed: { type: ['Number'], about: 'One seed always gives the same result.' },
  separator: { type: ['Text'], about: 'Text between the pieces, such as ",".' },
  start: { type: ['Number'], about: 'Where it starts, from 0.' },
  step: { type: ['Number'], about: 'Step size, such as 0.25.' },
  table: { type: ['List'], about: 'Rows of a key and its value.' },
  text: { type: ['Text'], about: 'A text.' },
  'text or list': { type: ['Text', 'List'], about: 'A text or a list.' },
  thousands: { type: ['Text'], about: 'Mark between thousands, such as ",".' },
  times: { type: ['Number'], about: 'How many times.' },
  to: { type: ['Number', 'Vector'], about: 'Where the way ends.' },
  to_high: { type: ['Number'], about: 'High end of the new range.' },
  to_low: { type: ['Number'], about: 'Low end of the new range.' },
  value: { type: ['Number'], about: 'The number to work on.' },
  axis: { type: ['Vector'], about: 'The axis to turn around.' },
  end: { type: ['Number'], about: 'Where the kept part ends, from 0 to 1.' },
  normal: { type: ['Vector'], about: 'The way the plane faces.' },
  point: { type: ['Vector'], about: 'A point.' },
  scale: { type: ['Number'], about: 'How stretched the noise is; a bigger scale is smoother.' },
  through: { type: ['Vector'], about: 'A point on the plane.' },
  vector: { type: ['Vector'], about: 'A vector.' },
  width: { type: ['Number'], about: 'Length to fill up to.' },
  with: { type: ['Text'], about: 'Text to put in instead.' },
  x: { type: ['Number'], about: 'The X value.' },
  y: { type: ['Number'], about: 'The Y value.' },
  z: { type: ['Number'], about: 'The Z value.' },
};

/** Inputs whose meaning differs in one function, by function, then name. */
const SOLID_SCRIPT_FUNCTION_ARGUMENTS_OWN: Readonly<
  Record<string, Readonly<Record<string, Omit<SolidScriptFunctionArgument, 'name'>>>>
> = {
  hits_box: {
    element: {
      type: ['Brush', 'Mesh', 'Face', 'Edge', 'Vertex', 'Vector', 'List'],
      about: 'The thing to test, such as [$Brush] or [$Face].',
    },
    center: { type: ['Vector'], about: 'Center of the box.' },
    size: {
      type: ['Vector', 'Number'],
      about: 'Width, height and depth in metres. One number is used on every axis.',
    },
    how: {
      type: ['Text'],
      about: 'Touching, Overlapping or Fully Inside. Touching when How is left off.',
    },
  },
  asin: { value: { type: ['Number'], about: 'A sine, from -1 to 1.' } },
  acos: { value: { type: ['Number'], about: 'A cosine, from -1 to 1.' } },
  atan: { value: { type: ['Number'], about: 'A tangent.' } },
  atan2: { y: { type: ['Number'], about: 'Y of the point.' }, x: { type: ['Number'], about: 'X of the point.' } },
  min: {
    a: { type: ['Number', 'List'], about: 'A number, or one list of numbers.' },
    b: { type: ['Number'], about: 'Another number.' },
    '...': { type: ['Number'], about: 'More numbers.' },
  },
  max: {
    a: { type: ['Number', 'List'], about: 'A number, or one list of numbers.' },
    b: { type: ['Number'], about: 'Another number.' },
    '...': { type: ['Number'], about: 'More numbers.' },
  },
  hypot: {
    a: { type: ['Number'], about: 'One side.' },
    b: { type: ['Number'], about: 'Another side.' },
    '...': { type: ['Number'], about: 'More sides.' },
  },
  mod: {
    a: { type: ['Number'], about: 'The number to divide.' },
    b: { type: ['Number'], about: 'What to divide by.' },
  },
  dot: { a: { type: ['Vector'], about: 'The first vector.' }, b: { type: ['Vector'], about: 'The second vector.' } },
  cross: { a: { type: ['Vector'], about: 'The first vector.' }, b: { type: ['Vector'], about: 'The second vector.' } },
  distance: { a: { type: ['Vector'], about: 'The first point.' }, b: { type: ['Vector'], about: 'The second point.' } },
  str: {
    a: { type: 'Any', about: 'A value to join.' },
    b: { type: 'Any', about: 'Another value.' },
    '...': { type: 'Any', about: 'More values.' },
  },
  concat: {
    a: { type: 'Any', about: 'A list or value.' },
    b: { type: 'Any', about: 'Another list or value.' },
    '...': { type: 'Any', about: 'More lists or values.' },
  },
  pick: { number: { type: ['Number'], about: 'Position of the value to give, from 0.' } },
  index_of: { value: { type: 'Any', about: 'The value to find.' } },
  is_undef: { value: { type: 'Any', about: 'The value to check.' } },
  is_num: { value: { type: 'Any', about: 'The value to check.' } },
  is_list: { value: { type: 'Any', about: 'The value to check.' } },
  is_string: { value: { type: 'Any', about: 'The value to check.' } },
  is_bool: { value: { type: 'Any', about: 'The value to check.' } },
  curve_at: { x: { type: ['Number'], about: 'Where on the curve, from 0 to 1.' } },
  resample: { count: { type: ['Number'], about: 'How many points to give.' } },
  random: {
    min: { type: ['Number', 'Vector'], about: 'The lowest value, or a vector of lowest values.' },
    max: { type: ['Number', 'Vector'], about: 'The highest value, or a vector of highest values.' },
  },
  hash: { value: { type: 'Any', about: 'The value to hash.' } },
  path_at: { amount: { type: ['Number'], about: 'How far along the path: 0 is the start, 1 is the end.' } },
  path_direction: { amount: { type: ['Number'], about: 'How far along the path: 0 is the start, 1 is the end.' } },
  trim_path: {
    start: { type: ['Number'], about: 'Where the kept part starts, 0 at the first point, 1 at the last.' },
    end: { type: ['Number'], about: 'Where the kept part ends, 0 at the first point, 1 at the last.' },
  },
  angle: { a: { type: ['Vector'], about: 'The first vector.' }, b: { type: ['Vector'], about: 'The second vector.' } },
  nearest: {
    points: { type: ['List'], about: 'The points to search.' },
    point: { type: ['Vector'], about: 'The point to measure from.' },
  },
  time_text: { pattern: { type: ['Text'], about: 'Layout with YYYY, MM, DD, HH, mm and ss, such as "HH:mm".' } },
  slice: { start: { type: ['Number'], about: 'Position of the first item, from 0.' } },
  replace_pattern: { with: { type: ['Text'], about: 'Text to put in instead of every match.' } },
  ...SOLID_SCRIPT_CONDITION_HELPER_ARGUMENTS,
  ...SOLID_SCRIPT_KIND_CHECK_ARGUMENTS,
};

/**
 * Lists the inputs of a built-in function with their kind and meaning, read
 * from its usage.
 *
 * @param key Function key, such as clamp.
 * @returns Inputs in order; empty for an unknown function.
 */
export function solidScriptFunctionArguments(key: string): SolidScriptFunctionArgument[] {
  const usage = SOLID_SCRIPT_FUNCTION_DOCS[key]?.usage ?? '';
  const inside = /\((.*)\)/.exec(usage)?.[1]?.trim() ?? '';
  if (inside === '') return [];
  return inside.split(',').map((piece) => {
    const name = piece.trim();
    const known = SOLID_SCRIPT_FUNCTION_ARGUMENTS_OWN[key]?.[name] ??
      SOLID_SCRIPT_FUNCTION_ARGUMENTS[name] ?? { type: 'Any', about: '' };
    return { name, ...known };
  });
}
