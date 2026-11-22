import { solidScriptFunctionDocSummary } from './solid_script_function_docs_math.js';

/**
 * Docs of the number helpers: logarithms, hyperbolic functions, whole numbers,
 * bits and list statistics.
 */
export const SOLID_SCRIPT_FUNCTION_DOCS_NUMBERS = {
  log: {
    usage: 'Log(number, base)',
    summary: solidScriptFunctionDocSummary(
      'Log, the logarithm, asks how many times you multiply the base to get this number. The base is 10 when left off, so the Log of 100 is 2, because 10 × 10 is 100. Handy when sizes span a huge range and you want them on a friendlier scale. On a vector it works on each axis.',
      ['Log(10) is 1.', 'Log(100) is 2.', 'Log(16, 4) is 2.'],
      'Use it to tame a huge distance or a fast-growing value so a height or a slider stays readable.',
    ),
    group: 'Math',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  sinh: {
    usage: 'Sinh(number)',
    summary: solidScriptFunctionDocSummary(
      'The hyperbolic sine: grows like a wave that never turns back, slow near 0 and ever faster further out, keeping the sign. On a vector it works on each axis.',
      ['Sinh(0) is 0.'],
      'Use it for a curve that is gentle in the middle and steep at both ends.',
    ),
    group: 'Trigonometry',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  cosh: {
    usage: 'Cosh(number)',
    summary: solidScriptFunctionDocSummary(
      'The hyperbolic cosine: the shape of a hanging chain, 1 at 0 and rising the same on both sides. On a vector it works on each axis.',
      ['Cosh(0) is 1.'],
      'Use it for a sagging cable or a hanging arch.',
    ),
    group: 'Trigonometry',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  tanh: {
    usage: 'Tanh(number)',
    summary: solidScriptFunctionDocSummary(
      'The hyperbolic tangent: an S curve from -1 to 1 that passes 0 at 0 and flattens out far away. On a vector it works on each axis.',
      ['Tanh(0) is 0.'],
      'Use it to squash any value softly into the range -1 to 1.',
    ),
    group: 'Trigonometry',
    gives: ['Number', 'Vector'],
    perAxis: true,
  },
  gcd: {
    usage: 'Gcd(a, b)',
    summary: solidScriptFunctionDocSummary(
      'The greatest common divisor: the biggest whole number that divides both whole numbers.',
      ['Gcd(12, 18) is 6.', 'Gcd(7, 5) is 1.'],
      'Use it to find the largest tile that fits two lengths evenly.',
    ),
    group: 'Math',
    gives: ['Number'],
  },
  lcm: {
    usage: 'Lcm(a, b)',
    summary: solidScriptFunctionDocSummary(
      'The least common multiple: the smallest whole number both whole numbers divide into. It is 0 when either is 0.',
      ['Lcm(4, 6) is 12.', 'Lcm(3, 5) is 15.'],
      'Use it to find when two repeating patterns line up again.',
    ),
    group: 'Math',
    gives: ['Number'],
  },
  xor: {
    usage: 'Xor(a, b)',
    summary: solidScriptFunctionDocSummary(
      'Yes when exactly one of the two is true, No when both or neither are.',
      ['Xor(true, false) is Yes.', 'Xor(true, true) is No.'],
      'Use it to pick items on one side of a test or the other, but not both.',
    ),
    group: 'Checks',
    gives: ['Yes/No'],
  },
  div_floor: {
    usage: 'DivFloor(a, b)',
    summary: solidScriptFunctionDocSummary(
      'How many whole times b fits into a, rounded down, even below 0. Together with Mod it splits a number into whole rounds and a leftover. Round and Ceil of the plain division round the other ways.',
      ['DivFloor(7, 2) is 3.', 'DivFloor(-7, 2) is -4.'],
      'Use it to turn a running index into a row number, such as which floor a step is on.',
    ),
    group: 'Math',
    gives: ['Number'],
  },
  bit_and: {
    usage: 'BitAnd(a, b)',
    summary: solidScriptFunctionDocSummary(
      'Keeps the bits both whole numbers have.',
      ['BitAnd(12, 10) is 8.'],
      'Use it to test whether a flag bit is on: the result is above 0 when it is.',
    ),
    group: 'Math',
    gives: ['Number'],
  },
  bit_or: {
    usage: 'BitOr(a, b)',
    summary: solidScriptFunctionDocSummary(
      'Keeps the bits either whole number has.',
      ['BitOr(12, 10) is 14.'],
      'Use it to turn a flag bit on.',
    ),
    group: 'Math',
    gives: ['Number'],
  },
  bit_xor: {
    usage: 'BitXor(a, b)',
    summary: solidScriptFunctionDocSummary(
      'Keeps the bits only one of the whole numbers has.',
      ['BitXor(12, 10) is 6.'],
      'Use it to flip a flag bit.',
    ),
    group: 'Math',
    gives: ['Number'],
  },
  median: {
    usage: 'Median(list)',
    summary: solidScriptFunctionDocSummary(
      'The middle number of a list once sorted; with an even count, the average of the two middle ones.',
      ['Median([3, 1, 2]) is 2.', 'Median([4, 1, 3, 2]) is 2.5.'],
      'Use it for a typical size that one odd value cannot drag away.',
    ),
    group: 'Math',
    gives: ['Number'],
  },
  range: {
    usage: 'Range(list)',
    summary: solidScriptFunctionDocSummary(
      'How far apart the highest and lowest numbers of a list are.',
      ['Range([3, 9, 5]) is 6.'],
      'Use it to see how much heights or sizes vary.',
    ),
    group: 'Math',
    gives: ['Number'],
  },
  std_dev: {
    usage: 'StdDev(list)',
    summary: solidScriptFunctionDocSummary(
      'The standard deviation: how far the numbers of a list typically sit from their average, the square root of the average squared distance.',
      ['StdDev([2, 4, 4, 4, 5, 5, 7, 9]) is 2.', 'StdDev([5, 5]) is 0.'],
      'Use it to tell an even row of sizes from a ragged one.',
    ),
    group: 'Math',
    gives: ['Number'],
  },
} as const;

/** A number input that takes a vector as well, to work on per axis. */
const SOLID_SCRIPT_NUMBERS_PER_AXIS = {
  type: ['Number', 'Vector'],
  about: 'A number, or a vector to work on per axis.',
} as const;

/** Inputs of the number helpers that mean something of their own. */
export const SOLID_SCRIPT_NUMBERS_ARGUMENTS = {
  log: {
    number: SOLID_SCRIPT_NUMBERS_PER_AXIS,
    base: { type: ['Number'], about: 'The number multiplied, 10 when left off.', default: '10', start: '2' },
  },
  sinh: { number: SOLID_SCRIPT_NUMBERS_PER_AXIS },
  cosh: { number: SOLID_SCRIPT_NUMBERS_PER_AXIS },
  tanh: { number: SOLID_SCRIPT_NUMBERS_PER_AXIS },
  xor: {
    a: { type: ['Yes/No'], about: 'The first test.', start: 'true' },
    b: { type: ['Yes/No'], about: 'The second test.', start: 'false' },
  },
} as const;
