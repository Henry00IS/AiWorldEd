import type { SOLID_SCRIPT_KINDS } from './solid_script_kinds.js';
import type { SolidScriptBuiltinName } from './solid_script_functions_builtin.js';
import {
  SOLID_SCRIPT_WHERE_HELPER_ARGUMENTS,
  SOLID_SCRIPT_WHERE_HELPER_DOCS,
  solidScriptWhereHelper,
  solidScriptWhereHelperLeast,
} from './solid_script_where_helpers.js';
import { SOLID_SCRIPT_HITS_HOW_WORDS } from './solid_script_hits.js';
import {
  SOLID_SCRIPT_KIND_CHECK_ARGUMENTS,
  SOLID_SCRIPT_KIND_CHECK_DOCS,
} from './solid_script_functions_kind_checks.js';
import { SOLID_SCRIPT_FUNCTION_DOCS_MATH, solidScriptFunctionDocSummary } from './solid_script_function_docs_math.js';
import {
  SOLID_SCRIPT_FUNCTION_DOCS_NUMBERS,
  SOLID_SCRIPT_NUMBERS_ARGUMENTS,
} from './solid_script_function_docs_numbers.js';
import {
  SOLID_SCRIPT_COORDINATES_ARGUMENTS,
  SOLID_SCRIPT_FUNCTION_DOCS_COORDINATES,
} from './solid_script_function_docs_coordinates.js';
import { SOLID_SCRIPT_NOISE_TYPES, SOLID_SCRIPT_VORONOI_OUTPUTS } from './solid_script_functions_noise.js';
import {
  SOLID_SCRIPT_FUNCTION_DOCS_MATRIX,
  SOLID_SCRIPT_FUNCTION_DOCS_SHAPING,
  SOLID_SCRIPT_SHAPING_WAVE_ARGUMENTS,
} from './solid_script_function_docs_shaping.js';
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

/**
 * Groups of the built-in functions, in the order the formula palette shows
 * them.
 */
export const SOLID_SCRIPT_FUNCTION_GROUPS = [
  'Math',
  'Trigonometry',
  'Vector',
  'Text',
  'List',
  'Curve',
  'Path',
  'Random',
  'Checks',
  'Functions',
] as const;

/** Group of a built-in function, such as Math or Text. */
export type SolidScriptFunctionGroup = (typeof SOLID_SCRIPT_FUNCTION_GROUPS)[number];

/** How to call one built-in function and what it gives. */
export interface SolidScriptFunctionDoc {
  /** Call with its inputs, such as pad_left(text, width, fill). */
  usage: string;
  /**
   * What it does, in plain words, with examples on their own lines when it has
   * them.
   */
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
  /**
   * For math that works per axis, such as Abs or Min: numbers give a number and
   * a vector gives a vector, so the editor checks narrow Gives by the inputs.
   */
  perAxis?: true;
  /**
   * Group in the reference and the category of its block in the formula editor;
   * Functions holds what fits no other.
   */
  group: SolidScriptFunctionGroup;
}

/**
 * Every built-in function of formulas, by name: the TypeScript type makes a
 * function without its kinds fail to build.
 */
const SOLID_SCRIPT_FUNCTION_DOCS_NAMED: Readonly<Record<SolidScriptBuiltinName, SolidScriptFunctionDoc>> = {
  ...SOLID_SCRIPT_FUNCTION_DOCS_MATH,
  ...SOLID_SCRIPT_FUNCTION_DOCS_SHAPING,
  ...SOLID_SCRIPT_FUNCTION_DOCS_MATRIX,
  ...SOLID_SCRIPT_FUNCTION_DOCS_NUMBERS,
  ...SOLID_SCRIPT_FUNCTION_DOCS_COORDINATES,
  str: {
    usage: 'Str(a, b, ...)',
    summary: 'Joins values into one text, such as Str(3, "x") is 3x.',
    group: 'Text',
    gives: ['Text'],
  },
  uppercase: {
    usage: 'Uppercase(text)',
    summary: 'TEXT IN CAPITALS, such as Uppercase("hi") is HI.',
    group: 'Text',
    gives: ['Text'],
  },
  lowercase: {
    usage: 'Lowercase(text)',
    summary: 'text in small letters, such as Lowercase("Hi") is hi.',
    group: 'Text',
    gives: ['Text'],
  },
  capitalize: {
    usage: 'Capitalize(text)',
    summary: 'First letter as a capital, such as Capitalize("hello") is Hello.',
    group: 'Text',
    gives: ['Text'],
  },
  title_case: {
    usage: 'TitleCase(text)',
    summary: 'Every Word Starts With A Capital, such as TitleCase("hello world") is Hello World.',
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
    summary: 'Yes when the text holds the part, such as Contains("hello", "ell").',
    group: 'Text',
    gives: ['Yes/No'],
  },
  starts_with: {
    usage: 'StartsWith(text, part)',
    summary: 'Yes when the text starts with the part, such as StartsWith("hello", "he").',
    group: 'Text',
    gives: ['Yes/No'],
  },
  ends_with: {
    usage: 'EndsWith(text, part)',
    summary: 'Yes when the text ends with the part, such as EndsWith("hello", "lo").',
    group: 'Text',
    gives: ['Yes/No'],
  },
  position: {
    usage: 'Position(text, part)',
    summary: 'Where the part starts, from 0, or -1, such as Position("hello", "ell") is 1.',
    group: 'Text',
    gives: ['Number'],
  },
  count_text: {
    usage: 'CountText(text, part)',
    summary: 'How often the part is in the text, such as CountText("abab", "ab") is 2.',
    group: 'Text',
    gives: ['Number'],
  },
  character_code: {
    usage: 'CharacterCode(text)',
    summary: 'The number of the first character, such as CharacterCode("A") is 65.',
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
    summary: 'A piece of the text, from 0, such as Part("hello", 1, 3) is ell.',
    group: 'Text',
    gives: ['Text'],
  },
  replace: {
    usage: 'Replace(text, find, with)',
    summary: 'Replaces every copy of a part, such as Replace("hello", "l", "r") is herro.',
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
    summary: 'The text several times, such as RepeatText("ha", 3) is hahaha.',
    group: 'Text',
    gives: ['Text'],
  },
  reversed: {
    usage: 'Reversed(text or list)',
    summary: 'Back to front, such as Reversed("abc") is cba.',
    group: 'Text',
    gives: ['Text', 'List'],
  },
  split: {
    usage: 'Split(text, separator)',
    summary: 'List of the pieces between separators, such as Split("a,b,c", ",") is [a, b, c].',
    group: 'Text',
    gives: ['List'],
  },
  join: {
    usage: 'Join(list, separator)',
    summary: 'One text from the items of a list, such as Join([1, 2, 3], " and ") is 1 and 2 and 3.',
    group: 'Text',
    gives: ['Text'],
  },
  characters: {
    usage: 'Characters(text)',
    summary: 'List of the single letters, such as Characters("hi") is [h, i].',
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
      'Reads text like a typed field, with its brackets, vectors, lists and math, such as Parse("4, 5, 5") is [4, 5, 5]; Parse("5+5") is 10.',
    group: 'Text',
    gives: 'Any',
  },
  number: {
    usage: 'Number(text)',
    summary: 'Reads text as a number, such as Number("12") is 12.',
    group: 'Text',
    gives: ['Number'],
  },
  format_number: {
    usage: 'FormatNumber(number, decimals, thousands)',
    summary: 'Writes a number with decimals and a thousands mark, such as FormatNumber(1234.5, 2, ",") is 1,234.50.',
    group: 'Text',
    gives: ['Text'],
  },
  time_text: {
    usage: 'TimeText(seconds, pattern)',
    summary: 'Writes a time with YYYY MM DD HH mm ss, such as $Time.Now.',
    group: 'Functions',
    gives: ['Text'],
  },
  len: {
    usage: 'Len(list or text)',
    summary: 'How many items or letters, such as Len("hello") is 5.',
    group: 'List',
    gives: ['Number'],
  },
  list: {
    usage: 'List(a, b, ...)',
    summary: solidScriptFunctionDocSummary(
      'Makes a list from the values you give it, in that order. It takes any number of values, none at all for an empty list, and each one can be a number, a text, a vector or another list.',
      [
        'List(1, 2, 3) is [1, 2, 3].',
        'List("a", "b") is [a, b].',
        'List() is [].',
        'List(0, List(1, 1, 1), "Easy") is [0, [1, 1, 1], Easy].',
      ],
      'Use it to hand a few values to a function that takes a list, such as Reversed(List("a", "b", "c")). Writing the values in brackets, such as [0, [1, 1, 1], "Easy"], makes the same list.',
    ),
    group: 'List',
    gives: ['List'],
  },
  concat: {
    usage: 'Concat(a, b, ...)',
    summary: 'One list from lists and values, such as Concat([1, 2, 3], 4) is [1, 2, 3, 4].',
    group: 'List',
    gives: ['List'],
  },
  lookup: {
    usage: 'Lookup(key, table)',
    summary:
      'Value between the rows of a key table, such as Lookup(5, [Table]) with [Table] a list of key, value rows.',
    group: 'List',
    gives: ['Number'],
  },
  first: {
    usage: 'First(list, count)',
    summary:
      'The first item, such as First([4, 5, 6]) is 4. With a Count, a list of the first items, such as First([4, 5, 6], 2) is [4, 5].',
    group: 'List',
    gives: 'Any',
  },
  last: {
    usage: 'Last(list, count)',
    summary:
      'The last item, such as Last([4, 5, 6]) is 6. With a Count, a list of the last items, such as Last([4, 5, 6], 2) is [5, 6].',
    group: 'List',
    gives: 'Any',
  },
  slice: {
    usage: 'Slice(list or text, start, count)',
    summary:
      'Some items, from 0, such as Slice([4, 5, 6], 1, 2) is [5, 6]. On a text it gives some characters, such as Slice("Tower", 1, 3) is "owe".',
    group: 'List',
    gives: ['List', 'Text'],
  },
  item_or: {
    usage: 'ItemOr(list, index, fallback)',
    summary: 'The item at an index, from 0, or the fallback when there is none, such as ItemOr([1, 2, 3], 5, 0) is 0.',
    group: 'List',
    gives: 'Any',
  },
  item_clamp: {
    usage: 'ItemClamp(list, index)',
    summary:
      'The item at an index, from 0, using the first or last item when the index is outside the list, such as ItemClamp([1, 2, 3], 5) is 3.',
    group: 'List',
    gives: 'Any',
  },
  item_wrap: {
    usage: 'ItemWrap(list, index)',
    summary:
      'The item at an index, from 0, counting round again past either end, so -1 is the last, such as ItemWrap([1, 2, 3], 3) is 1.',
    group: 'List',
    gives: 'Any',
  },
  index_of: {
    usage: 'IndexOf(list, value)',
    summary: 'Where a value is, from 0, or -1, such as IndexOf([4, 5, 6], 5) is 1.',
    group: 'List',
    gives: ['Number'],
  },
  unique: {
    usage: 'Unique(list)',
    summary: 'The list without repeats, such as Unique([1, 1, 2]) is [1, 2].',
    group: 'List',
    gives: ['List'],
  },
  sorted: {
    usage: 'Sorted(list)',
    summary: 'A sorted copy: numbers small to big, words A to Z, such as Sorted([3, 1, 2]) is [1, 2, 3].',
    group: 'List',
    gives: ['List'],
  },
  pick: {
    usage: 'Pick(number, first, second, ...)',
    summary: 'The value at a position, from 0, such as Pick(1, "a", "b", "c") is b.',
    group: 'List',
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
    summary: 'Yes for a list or vector, such as IsList([1, 2, 3]).',
    group: 'Checks',
    gives: ['Yes/No'],
    checks: ['List', 'Vector'],
  },
  is_string: {
    usage: 'IsString(value)',
    summary: 'Yes for text, such as IsString("hello").',
    group: 'Checks',
    gives: ['Yes/No'],
    checks: ['Text'],
  },
  is_bool: {
    usage: 'IsBool(value)',
    summary: 'Yes for Yes or No, such as IsBool(true).',
    group: 'Checks',
    gives: ['Yes/No'],
    checks: ['Yes/No'],
  },
  curve_at: {
    usage: 'CurveAt(curve, x)',
    summary: 'Height of a curve at x, from 0 to 1, such as CurveAt([Profile], 0.5).',
    group: 'Curve',
    gives: ['Number'],
  },
  path_length: {
    usage: 'PathLength(points)',
    summary: 'Length of a path through points, such as PathLength([Path]).',
    group: 'Path',
    gives: ['Number'],
  },
  resample: {
    usage: 'Resample(points, count)',
    summary: 'Count points evenly spaced along a path, from its start to its end, such as Resample([Path], 8).',
    group: 'Path',
    gives: ['List'],
  },
  resample_every: {
    usage: 'ResampleEvery(points, distance)',
    summary:
      'Points a fixed distance apart along a path, from its start, keeping its end as a shorter last step, such as ResampleEvery([[0, 0, 0], [1, 0, 0]], 0.4).',
    group: 'Path',
    gives: ['List'],
  },
  profile_points: {
    usage: 'ProfilePoints(curve, height, radius)',
    summary:
      'A profile as [height, radius] points, like a column samples it, such as ProfilePoints([Profile], 2, 0.5).',
    group: 'Curve',
    gives: ['List'],
  },
  rands: {
    usage: 'Rands(min, max, count, seed)',
    summary: 'A list of random numbers, such as Rands(0, 1, 4, 1).',
    group: 'Random',
    gives: ['List'],
  },
  hash: {
    usage: 'Hash(value, seed)',
    summary:
      'A number from 0 to 1 that is always the same for the same value and seed, such as Hash("Wall", 1). It takes numbers, text, Yes/No and vectors; for a face, edge or vertex give its stable id, such as Hash([$Face.Id]), so the number stays when other faces change.',
    group: 'Random',
    gives: ['Number'],
  },
  noise: {
    usage: 'Noise(position, scale, seed, detail, roughness, type)',
    summary: solidScriptFunctionDocSummary(
      'Smooth random bumps from 0 to 1 at a position; one seed always gives the same field. Scale is the size of one bump in metres. Detail adds finer layers on top (2 when left off, 0 for plain bumps) and Roughness is how strong each finer layer is (0.5). Type Ridged gives sharp ridges, Terrain keeps low ground smooth and high ground rough.',
      [
        'Noise(Vector(1, 0, 0), 1, 4) gives the same number every time.',
        'Noise(Vector([$X], 0, [$Z]), 4, 1, 4, 0.6, "Terrain") makes mountains under Displace.',
      ],
      'Use it with Displace for rolling ground, or with Random sizes that change smoothly across a level.',
    ),
    group: 'Random',
    gives: ['Number'],
  },
  noise_vector: {
    usage: 'NoiseVector(position, scale, seed)',
    summary: solidScriptFunctionDocSummary(
      'Three separate smooth noise values at once, each from 0 to 1, as a vector.',
      ['NoiseVector(Vector(1, 0, 0), 1, 4) gives three different numbers.'],
      'Use it to wobble a position or a rotation on every axis.',
    ),
    group: 'Random',
    gives: ['Vector'],
  },
  voronoi: {
    usage: 'Voronoi(position, scale, seed, output)',
    summary: solidScriptFunctionDocSummary(
      'Splits space into random cells, like cracked mud or cobblestones. Output Distance (the default) is how far the position is from its cell spot, Edge is how close it is to the edge between two cells (0 on the edge), and Cell is one random value from 0 to 1 per cell.',
      [
        'Voronoi(Vector(0, 0, 0), 1, 3, "Cell") gives one value for the whole cell.',
        'Voronoi(Vector([$X], 0, [$Z]), 2, 1, "Edge") < 0.1 picks the cracks.',
      ],
      'Use it for stone tiles, cracks, or giving each patch of ground its own height.',
    ),
    group: 'Random',
    gives: ['Number'],
  },
  shuffle: {
    usage: 'Shuffle(list, seed)',
    summary: 'The items of a list in a random order; one seed gives the same order, such as Shuffle([1, 2, 3], 1).',
    group: 'Random',
    gives: ['List'],
  },
  nearest: {
    usage: 'Nearest(points, point, skip)',
    summary:
      'Index of the closest point in a list, from 0, such as Nearest([Points], Vector(0, 0, 0)). Skip leaves out one index, so Nearest([Points], [$Point], [$Index]) finds the nearest other point; -1 when none is left.',
    group: 'Random',
    gives: ['Number'],
  },
  path_at: {
    usage: 'PathAt(points, amount)',
    summary: 'The point at a fraction of a path: 0 is the start, 1 is the end, such as PathAt([Path], 0.5).',
    group: 'Path',
    gives: ['Vector'],
  },
  path_direction: {
    usage: 'PathDirection(points, amount)',
    summary: 'The way a path faces at a fraction of its length, such as PathDirection([Path], 0.5).',
    group: 'Path',
    gives: ['Vector'],
  },
  trim_path: {
    usage: 'TrimPath(points, start, end)',
    summary: 'The part of a path from one fraction of its length to another, such as TrimPath([Path], 0.25, 0.75).',
    group: 'Path',
    gives: ['List'],
  },
  ...SOLID_SCRIPT_WHERE_HELPER_DOCS,
  ...SOLID_SCRIPT_KIND_CHECK_DOCS,
  hits: {
    usage: 'Hits(element, target, how)',
    summary:
      'Yes when the box of an element meets the box of another object, face, edge, vertex, point, or any item of a list, such as Hits([$Object], [Wall]). How is Touching by default (any contact, including sitting inside), Overlapping (they share interior space) or Fully Inside.',
    group: 'Checks',
    gives: ['Yes/No'],
  },
  hits_box: {
    usage: 'HitsBox(element, center, size, how)',
    summary:
      'Yes when the box of an element meets a box of a Center and Size, such as HitsBox([$Object], Vector(0, 0, 0), 2). How is Touching by default, Overlapping or Fully Inside.',
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
  /** Words it takes, when it takes one of a few. */
  choices?: readonly string[];
  /** Value it stands for when left off, as typed. */
  default?: string;
  /** Value a new formula block fills in, as typed, such as 0.5. */
  start?: string;
}

/** Kind and meaning of the inputs by name, shared by the functions using it. */
const SOLID_SCRIPT_FUNCTION_ARGUMENTS: Readonly<Record<string, Omit<SolidScriptFunctionArgument, 'name'>>> = {
  how: {
    type: ['Text'],
    about: 'How the boxes meet: Touching, Overlapping or Fully Inside.',
    choices: SOLID_SCRIPT_HITS_HOW_WORDS,
    default: 'Touching',
  },
  '...': { type: 'Any', about: 'More values, as many as needed.' },
  a: { type: ['Number'], about: 'The first number.', start: '0' },
  b: { type: ['Number'], about: 'The second number.', start: '1' },
  amount: { type: ['Number'], about: 'How far along: 0 is From, 1 is To.', start: '0.5' },
  code: { type: ['Number'], about: 'Character number, such as 65 for A.', start: '65' },
  count: { type: ['Number'], about: 'How many.', start: '1' },
  curve: { type: 'Any', about: 'A curve, such as a curve Input.' },
  decimals: { type: ['Number'], about: 'Digits after the decimal point.', start: '2' },
  degrees: { type: ['Number'], about: 'Angle in degrees.', start: '45' },
  edge_high: { type: ['Number'], about: 'Where the result reaches 1.', start: '1' },
  edge_low: { type: ['Number'], about: 'Where the result starts to rise above 0.', start: '0' },
  fallback: { type: 'Any', about: 'What it gives when there is no such item.' },
  fill: { type: ['Text'], about: 'Character to fill with, such as "0".', start: '0' },
  find: { type: ['Text'], about: 'The part to replace.' },
  first: { type: 'Any', about: 'Value at position 0.' },
  from: { type: ['Number', 'Vector'], about: 'Where the way starts.', start: '0' },
  from_high: { type: ['Number'], about: 'High end of the range the value is in.', start: '1' },
  from_low: { type: ['Number'], about: 'Low end of the range the value is in.', start: '0' },
  height: { type: ['Number'], about: 'Height of the profile.', start: '1' },
  index: { type: ['Number'], about: 'Position, from 0.' },
  key: { type: ['Number'], about: 'The value to look up.' },
  list: { type: ['List'], about: 'A list.' },
  'list or text': { type: ['List', 'Text'], about: 'A list or a text.' },
  max: { type: ['Number'], about: 'The highest value.', start: '1' },
  min: { type: ['Number'], about: 'The lowest value.', start: '0' },
  number: { type: ['Number'], about: 'A number.' },
  part: { type: ['Text'], about: 'The piece of text to look for.' },
  pattern: { type: ['Text'], about: 'Pattern the text is matched against.' },
  points: { type: ['List', 'Path'], about: 'A Path, or the points of one.' },
  power: { type: ['Number'], about: 'The power to raise to.', start: '2' },
  radians: { type: ['Number'], about: 'Angle in radians.', start: '1' },
  radius: { type: ['Number'], about: 'Radius of the profile.', start: '0.5' },
  second: { type: 'Any', about: 'Value at position 1.' },
  seconds: { type: ['Number'], about: 'A time in seconds, such as $Time.Now.' },
  seed: { type: ['Number'], about: 'One seed always gives the same result.', start: '0' },
  separator: { type: ['Text'], about: 'Text between the pieces, such as ",".', start: ',' },
  start: { type: ['Number'], about: 'Where it starts, from 0.', start: '0' },
  step: { type: ['Number'], about: 'Step size, such as 0.25.', start: '0.25' },
  table: { type: ['List'], about: 'Rows of a key and its value.' },
  text: { type: ['Text'], about: 'A text.' },
  'text or list': { type: ['Text', 'List'], about: 'A text or a list.' },
  thousands: { type: ['Text'], about: 'Mark between thousands, such as ",".', start: ',' },
  times: { type: ['Number'], about: 'How many times.', start: '2' },
  to: { type: ['Number', 'Vector'], about: 'Where the way ends.', start: '1' },
  to_high: { type: ['Number'], about: 'High end of the new range.', start: '10' },
  to_low: { type: ['Number'], about: 'Low end of the new range.', start: '0' },
  value: { type: ['Number'], about: 'The number to work on.' },
  axis: { type: ['Vector'], about: 'The axis to turn around.', start: '0, 1, 0' },
  end: { type: ['Number'], about: 'Where the kept part ends, from 0 to 1.', start: '1' },
  normal: { type: ['Vector'], about: 'The way the plane faces.', start: '0, 1, 0' },
  point: { type: ['Vector'], about: 'A point.', start: '0, 0, 0' },
  scale: { type: ['Number'], about: 'How stretched the noise is; a bigger scale is smoother.', start: '1' },
  through: { type: ['Vector'], about: 'A point on the plane.', start: '0, 0, 0' },
  vector: { type: ['Vector'], about: 'A vector.' },
  width: { type: ['Number'], about: 'Length to fill up to.', start: '3' },
  with: { type: ['Text'], about: 'Text to put in instead.' },
  x: { type: ['Number'], about: 'The X value.', start: '0' },
  y: { type: ['Number'], about: 'The Y value.', start: '0' },
  z: { type: ['Number'], about: 'The Z value.', start: '0' },
};

/**
 * Two vectors at a right angle, the inputs a new Dot, Cross or Angle block
 * starts with.
 */
const VECTORS_START = {
  a: { type: ['Vector'], about: 'The first vector.', start: '1, 0, 0' },
  b: { type: ['Vector'], about: 'The second vector.', start: '0, 1, 0' },
} as const;

/** Inputs whose meaning differs in one function, by function, then name. */
/** A number, or a vector a math function works on per axis. */
const PER_AXIS = { type: ['Number', 'Vector'], about: 'A number, or a vector to work on per axis.' } as const;

/**
 * Inputs of the math functions that work per axis: each takes a vector as well
 * as a number, under the name its usage writes.
 */
const PER_AXIS_INPUTS = {
  lerp: { amount: { ...PER_AXIS, about: 'How far from From toward To, or one amount per axis.', start: '0.5' } },
  sin: { degrees: { ...PER_AXIS, start: '45' } },
  cos: { degrees: { ...PER_AXIS, start: '45' } },
  tan: { degrees: { ...PER_AXIS, start: '45' } },
  asin: { value: { ...PER_AXIS, about: 'A sine, from -1 to 1, or a vector of them.', start: '0.5' } },
  acos: { value: { ...PER_AXIS, about: 'A cosine, from -1 to 1, or a vector of them.', start: '0.5' } },
  atan: { value: { ...PER_AXIS, about: 'A tangent, or a vector of them.', start: '1' } },
  abs: { number: PER_AXIS },
  sign: { number: PER_AXIS },
  ceil: { number: PER_AXIS },
  floor: { number: PER_AXIS },
  round: { number: PER_AXIS },
  fract: { number: PER_AXIS },
  sqrt: { number: PER_AXIS },
  exp: { number: PER_AXIS },
  ln: { number: PER_AXIS },
  pow: { number: PER_AXIS, power: { ...PER_AXIS, about: 'The power, or one per axis.', start: '2' } },
  snap: { value: PER_AXIS, step: { ...PER_AXIS, about: 'Step size, such as 0.25, or one per axis.', start: '0.25' } },
  wrap: {
    value: PER_AXIS,
    min: { ...PER_AXIS, about: 'Start of the range, or one per axis.', start: '0' },
    max: { ...PER_AXIS, about: 'End of the range, or one per axis.', start: '360' },
  },
  mod: {
    a: { ...PER_AXIS, about: 'The number or vector to divide.', start: '10' },
    b: { ...PER_AXIS, about: 'What to divide by, or one per axis.', start: '3' },
  },
  min: {
    a: { type: ['Number', 'Vector', 'List'], about: 'A number or vector, or one list of numbers.', start: '0' },
    b: { ...PER_AXIS, about: 'Another number, or another vector for the lowest per axis.' },
    '...': { ...PER_AXIS, about: 'More numbers or vectors.' },
  },
  max: {
    a: { type: ['Number', 'Vector', 'List'], about: 'A number or vector, or one list of numbers.', start: '0' },
    b: { ...PER_AXIS, about: 'Another number, or another vector for the highest per axis.' },
    '...': { ...PER_AXIS, about: 'More numbers or vectors.' },
  },
  equal: {
    a: { type: ['Number', 'Vector', 'Text'], about: 'The first value.', start: '1' },
    b: { type: ['Number', 'Vector', 'Text'], about: 'The second value.', start: '1.0005' },
    tolerance: {
      type: ['Number'],
      about: 'How far apart two numbers may be and still match.',
      default: '0.001',
      start: '0.001',
    },
  },
  smooth_min: {
    a: { ...PER_AXIS, about: 'The first number, or a vector.', start: '0' },
    b: { ...PER_AXIS, about: 'The second number, or a vector.', start: '1' },
    distance: { ...PER_AXIS, about: 'How close they must come to blend; 0 is plain Min.', start: '0.5' },
  },
  smooth_max: {
    a: { ...PER_AXIS, about: 'The first number, or a vector.', start: '0' },
    b: { ...PER_AXIS, about: 'The second number, or a vector.', start: '1' },
    distance: { ...PER_AXIS, about: 'How close they must come to blend; 0 is plain Max.', start: '0.5' },
  },
  ping_pong: {
    value: { ...PER_AXIS, start: '3' },
    length: { ...PER_AXIS, about: 'Top of the bounce, or one per axis.', start: '2' },
  },
  remap: {
    value: { ...PER_AXIS, start: '0.5' },
    clamp: {
      type: ['Yes/No'],
      about: 'Keeps the result inside the target range; false lets it go on past.',
      default: 'true',
      start: 'true',
    },
    steps: {
      type: ['Number'],
      about: 'How many even steps the result jumps between; 0 slides smoothly.',
      default: '0',
      start: '4',
    },
    ease: {
      type: ['Text'],
      about: 'Linear slides evenly; Smoothstep and Smootherstep ease gently at the edges.',
      choices: ['Linear', 'Smoothstep', 'Smootherstep'],
      default: 'Linear',
      start: 'Linear',
    },
  },
} as const;

const SOLID_SCRIPT_FUNCTION_ARGUMENTS_OWN: Readonly<
  Record<string, Readonly<Record<string, Omit<SolidScriptFunctionArgument, 'name'>>>>
> = {
  hits_box: {
    element: {
      type: ['Object', 'Mesh', 'Face', 'Edge', 'Vertex', 'Vector', 'List'],
      about: 'The thing to test, such as [$Object] or [$Face].',
    },
    center: { type: ['Vector'], about: 'Center of the box, such as [0, 1, 0].', start: '0, 0, 0' },
    size: {
      type: ['Vector', 'Number'],
      about: 'Width, height and depth in metres, such as [4, 2, 4]; or one number for every axis, such as 2.',
      start: '1',
    },
  },
  atan2: {
    y: { type: ['Number'], about: 'Y of the point.', start: '1' },
    x: { type: ['Number'], about: 'X of the point.', start: '1' },
  },
  hypot: {
    a: { type: ['Number'], about: 'One side.', start: '3' },
    b: { type: ['Number'], about: 'Another side.', start: '4' },
    '...': { type: ['Number'], about: 'More sides.' },
  },
  dot: VECTORS_START,
  cross: VECTORS_START,
  distance: {
    a: { type: ['Vector'], about: 'The first point.', start: '0, 0, 0' },
    b: { type: ['Vector'], about: 'The second point.', start: '1, 0, 0' },
  },
  str: {
    a: { type: 'Any', about: 'A value to join.' },
    b: { type: 'Any', about: 'Another value.' },
    '...': { type: 'Any', about: 'More values.' },
  },
  list: {
    a: { type: 'Any', about: 'The first value.' },
    b: { type: 'Any', about: 'The next value.' },
    '...': { type: 'Any', about: 'More values.' },
  },
  concat: {
    a: { type: 'Any', about: 'A list or value.' },
    b: { type: 'Any', about: 'Another list or value.' },
    '...': { type: 'Any', about: 'More lists or values.' },
  },
  rotate_vector: {
    degrees: { type: ['Number'], about: 'Angle in degrees.', start: '90' },
    center: { type: ['Vector'], about: 'Point the axis goes through.', default: '0, 0, 0', start: '0, 0, 0' },
  },
  rotate_euler: {
    vector: { type: ['Vector'], about: 'The point or direction to turn.', start: '1, 0, 0' },
    angles: { type: ['Vector'], about: 'Degrees around X, then Y, then Z.', start: '0, 90, 0' },
  },
  transform: {
    move: { type: ['Vector'], about: 'How far to move, in metres.', start: '0, 0, 0' },
    rotate: { type: ['Vector'], about: 'Degrees around X, Y and Z.', start: '0, 0, 0' },
    scale: { type: ['Vector'], about: 'Scale along each axis.', start: '1, 1, 1' },
  },
  noise: {
    position: { type: ['Vector'], about: 'Where to read the noise, such as Vector([$X], 0, [$Z]).', start: '0, 0, 0' },
    scale: { type: ['Number'], about: 'Size of one bump in metres.', start: '1', default: '1' },
    detail: { type: ['Number'], about: 'Finer layers on top, 0 to 15.', default: '2', start: '2' },
    roughness: {
      type: ['Number'],
      about: 'How strong each finer layer is, such as 0.5.',
      default: '0.5',
      start: '0.5',
    },
    type: { type: ['Text'], about: 'Smooth, Ridged or Terrain.', choices: SOLID_SCRIPT_NOISE_TYPES, default: 'Smooth' },
  },
  noise_vector: {
    position: { type: ['Vector'], about: 'Where to read the noise, such as Vector([$X], 0, [$Z]).', start: '0, 0, 0' },
    scale: { type: ['Number'], about: 'Size of one bump in metres.', start: '1', default: '1' },
  },
  voronoi: {
    position: { type: ['Vector'], about: 'Where to read the cells, such as Vector([$X], 0, [$Z]).', start: '0, 0, 0' },
    scale: { type: ['Number'], about: 'Size of one cell in metres.', start: '1', default: '1' },
    output: {
      type: ['Text'],
      about: 'Distance, Edge or Cell.',
      choices: SOLID_SCRIPT_VORONOI_OUTPUTS,
      default: 'Distance',
    },
  },
  invert: { matrix: { type: ['List'], about: 'A matrix, such as one from Transform.' } },
  transform_point: {
    matrix: { type: ['List'], about: 'A matrix, such as one from Transform.' },
    point: { type: ['Vector'], about: 'The point to place.', start: '0, 0, 0' },
  },
  transform_direction: {
    matrix: { type: ['List'], about: 'A matrix, such as one from Transform.' },
    direction: { type: ['Vector'], about: 'The direction to turn.', start: '0, 1, 0' },
  },
  matrix_move: { matrix: { type: ['List'], about: 'A matrix, such as one from Transform.' } },
  rotate_by: {
    rotation: { type: ['Vector'], about: 'First turn in X, Y, Z degrees.', start: '0, 0, 0' },
    by: { type: ['Vector'], about: 'Turn to apply, in X, Y, Z degrees.', start: '0, 90, 0' },
    local: {
      type: ['Yes/No'],
      about: 'True: turn in the rotated space. False: turn in world space.',
      default: 'false',
    },
  },
  matrix_rotate: { matrix: { type: ['List'], about: 'A matrix, such as one from Transform.' } },
  matrix_scale: { matrix: { type: ['List'], about: 'A matrix, such as one from Transform.' } },
  project_onto: {
    vector: { type: ['Vector'], about: 'The vector to project.', start: '2, 3, 0' },
    direction: { type: ['Vector'], about: 'The direction to keep.', start: '1, 0, 0' },
  },
  pick: { number: { type: ['Number'], about: 'Position of the value to give, from 0.' } },
  index_of: { value: { type: 'Any', about: 'The value to find.' } },
  is_undef: { value: { type: 'Any', about: 'The value to check.' } },
  is_num: { value: { type: 'Any', about: 'The value to check.' } },
  is_list: { value: { type: 'Any', about: 'The value to check.' } },
  is_string: { value: { type: 'Any', about: 'The value to check.' } },
  is_bool: { value: { type: 'Any', about: 'The value to check.' } },
  curve_at: { x: { type: ['Number'], about: 'Where on the curve, from 0 to 1.', start: '0.5' } },
  resample: { count: { type: ['Number'], about: 'How many points to give.', start: '8' } },
  resample_every: {
    distance: { type: ['Number'], about: 'How far apart the points are, at least 0.01.', start: '0.5' },
  },
  hash: { value: { type: 'Any', about: 'The value to hash.' } },
  path_at: {
    amount: { type: ['Number'], about: 'How far along the path: 0 is the start, 1 is the end.', start: '0.5' },
  },
  path_direction: {
    amount: { type: ['Number'], about: 'How far along the path: 0 is the start, 1 is the end.', start: '0.5' },
  },
  trim_path: {
    start: { type: ['Number'], about: 'Where the kept part starts, 0 at the first point, 1 at the last.', start: '0' },
    end: { type: ['Number'], about: 'Where the kept part ends, 0 at the first point, 1 at the last.', start: '1' },
  },
  angle: VECTORS_START,
  nearest: {
    points: { type: ['List', 'Path'], about: 'The points to search, or a Path.' },
    point: { type: ['Vector'], about: 'The point to measure from.', start: '0, 0, 0' },
    skip: {
      type: ['Number'],
      about: 'An index to leave out, such as [$Index] for the nearest other point; -1 skips none.',
      start: '-1',
    },
  },
  time_text: { pattern: { type: ['Text'], about: 'Layout with YYYY, MM, DD, HH, mm and ss, such as "HH:mm".' } },
  slice: { start: { type: ['Number'], about: 'Position of the first item, from 0.', start: '0' } },
  replace_pattern: { with: { type: ['Text'], about: 'Text to put in instead of every match.' } },
  ...PER_AXIS_INPUTS,
  ...SOLID_SCRIPT_WHERE_HELPER_ARGUMENTS,
  ...SOLID_SCRIPT_KIND_CHECK_ARGUMENTS,
  ...SOLID_SCRIPT_NUMBERS_ARGUMENTS,
  ...SOLID_SCRIPT_COORDINATES_ARGUMENTS,
  ...SOLID_SCRIPT_SHAPING_WAVE_ARGUMENTS,
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

/** Inputs at the end of a function that may be left off, by function key. */
const SOLID_SCRIPT_FUNCTION_INPUTS_LEFT_OFF: Readonly<Record<string, number>> = {
  first: 1,
  last: 1,
  checker: 1,
  log: 1,
  pad_left: 1,
  pad_right: 1,
  part: 1,
  split: 1,
  join: 1,
  format_number: 2,
  time_text: 1,
  hash: 1,
  noise: 5,
  noise_vector: 2,
  voronoi: 3,
  remap: 3,
  rotate_vector: 1,
  shuffle: 1,
  slice: 1,
  vector: 1,
};

/** Fewest inputs of functions that take as many as needed, when more than one. */
const SOLID_SCRIPT_FUNCTION_INPUTS_LEAST: Readonly<Record<string, number>> = { pick: 2, list: 0 };

/**
 * Returns the fewest inputs a function takes: the inputs its usage lists, less
 * those that may be left off; one for a function taking as many as needed, such
 * as Max, which also takes one list.
 *
 * @param key Function key, such as clamp.
 * @returns Fewest inputs.
 */
export function solidScriptFunctionInputsLeast(key: string): number {
  const inputs = solidScriptFunctionArguments(key);
  if (inputs.some((input) => input.name === '...')) return SOLID_SCRIPT_FUNCTION_INPUTS_LEAST[key] ?? 1;
  const helper = solidScriptWhereHelper(key);
  if (helper) return solidScriptWhereHelperLeast(helper);
  return inputs.length - (SOLID_SCRIPT_FUNCTION_INPUTS_LEFT_OFF[key] ?? 0);
}
