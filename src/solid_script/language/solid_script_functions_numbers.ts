import { solidScriptAxesEach } from './solid_script_functions_axes.js';
import { solidScriptExtraNumber, solidScriptExtraVector } from './solid_script_functions_extra.js';
import { solidScriptValueNumbers, solidScriptValueTruthy, type SolidScriptValue } from './solid_script_value.js';

/** A built-in function over evaluated arguments. */
type SolidScriptNumbersBuiltin = (args: SolidScriptValue[]) => SolidScriptValue;

/**
 * Wraps a one-number function so a vector works per axis.
 *
 * @param usage How to call it, for messages.
 * @param operation Function of one number.
 * @returns Built-in.
 */
function solidScriptNumbersUnary(usage: string, operation: (value: number) => number): SolidScriptNumbersBuiltin {
  return solidScriptAxesEach(usage, (args) => operation(solidScriptExtraNumber(args, 0, usage)));
}

/**
 * Reads two whole numbers.
 *
 * @param args Arguments.
 * @param usage How to call it, for messages.
 * @returns The two numbers, rounded and without sign.
 */
function solidScriptNumbersWhole(args: readonly SolidScriptValue[], usage: string): [number, number] {
  return [
    Math.abs(Math.round(solidScriptExtraNumber(args, 0, usage))),
    Math.abs(Math.round(solidScriptExtraNumber(args, 1, usage))),
  ];
}

/**
 * Greatest whole number that divides both.
 *
 * @param a First whole number, 0 or more.
 * @param b Second whole number, 0 or more.
 * @returns Greatest common divisor.
 */
function solidScriptNumbersGcd(a: number, b: number): number {
  let high = a;
  let low = b;
  while (low !== 0) [high, low] = [low, high % low];
  return high;
}

/**
 * Reads a list of numbers, which needs at least one.
 *
 * @param args Arguments.
 * @param usage How to call it, for messages.
 * @returns Numbers sorted low to high.
 */
function solidScriptNumbersSorted(args: readonly SolidScriptValue[], usage: string): number[] {
  const numbers = solidScriptValueNumbers(args[0]);
  if (!Array.isArray(args[0]) || !numbers || numbers.length === 0)
    throw new Error(`${usage} needs a list with at least one number`);
  return [...numbers].sort((a, b) => a - b);
}

/**
 * Applies a bit operation to two whole numbers.
 *
 * @param usage How to call it, for messages.
 * @param operation Bit operation.
 * @returns Built-in.
 */
function solidScriptNumbersBits(usage: string, operation: (a: number, b: number) => number): SolidScriptNumbersBuiltin {
  return (args) =>
    operation(Math.round(solidScriptExtraNumber(args, 0, usage)), Math.round(solidScriptExtraNumber(args, 1, usage)));
}

/**
 * Logarithm of a number to a base, 10 when left off.
 *
 * @param args Number and base.
 * @returns Logarithm.
 */
function solidScriptNumbersLog(args: readonly SolidScriptValue[]): number {
  const usage = 'Log(number, base)';
  const base = args.length > 1 ? solidScriptExtraNumber(args, 1, usage) : 10;
  if (base <= 0 || base === 1) throw new Error(`${usage} needs a base above 0 other than 1`);
  const number = solidScriptExtraNumber(args, 0, usage);
  return base === 10 ? Math.log10(number) : Math.log(number) / Math.log(base);
}

/**
 * Reads the items of a list to spread, each as its axes: one for a number,
 * three for a vector.
 *
 * @param list The list.
 * @param usage How to call it, for messages.
 * @returns Items and whether they are vectors.
 */
function solidScriptNumbersItems(list: SolidScriptValue, usage: string): { items: number[][]; vectors: boolean } {
  if (!Array.isArray(list) || list.length === 0) throw new Error(`${usage} needs a list with at least one number`);
  const numbers = solidScriptValueNumbers(list);
  if (numbers) return { items: numbers.map((value) => [value]), vectors: false };
  const items = list.flatMap((item) => solidScriptValueNumbers(item) ?? []);
  const size = solidScriptValueNumbers(list[0])?.length ?? 0;
  if (size === 0 || items.length !== list.length * size)
    throw new Error(`${usage} needs a list of numbers, or of vectors of one size`);
  return { items: list.map((_, index) => items.slice(index * size, index * size + size)), vectors: true };
}

/**
 * The variance of items axis by axis: the average squared distance from their
 * average.
 *
 * @param items Items, each as its axes.
 * @returns Variance per axis.
 */
function solidScriptNumbersVariance(items: readonly number[][]): number[] {
  return (items[0] ?? []).map((_, axis) => {
    const values = items.map((item) => item[axis] ?? 0);
    const mean = values.reduce((total, value) => total + value, 0) / values.length;
    return values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  });
}

/**
 * Variance-based spread of a list, or with groups one result per item for the
 * items of its own group.
 *
 * @param usage How to call it, for messages.
 * @param finish Turns a variance into the result, such as its square root.
 * @returns Built-in.
 */
function solidScriptNumbersSpread(usage: string, finish: (variance: number) => number): SolidScriptNumbersBuiltin {
  return (args) => {
    const { items, vectors } = solidScriptNumbersItems(args[0], usage);
    const shown = (variance: readonly number[]): SolidScriptValue =>
      vectors ? variance.map(finish) : finish(variance[0] ?? 0);
    if (args.length < 2) return shown(solidScriptNumbersVariance(items));
    const groups = solidScriptExtraVector(args, 1, usage);
    if (groups.length !== items.length) throw new Error(`${usage} needs one group per item, ${items.length} in all`);
    const spreads = new Map(
      [...new Set(groups)].map((group) => [
        group,
        shown(solidScriptNumbersVariance(items.filter((_, index) => groups[index] === group))),
      ]),
    );
    return groups.map((group) => spreads.get(group));
  };
}

/**
 * Number helpers: logarithms, hyperbolic functions, whole numbers, whole
 * division, bits and list statistics.
 */
export const SOLID_SCRIPT_FUNCTIONS_NUMBERS = {
  log: solidScriptAxesEach('Log(number, base)', (args) => solidScriptNumbersLog(args)),
  sinh: solidScriptNumbersUnary('Sinh(number)', Math.sinh),
  cosh: solidScriptNumbersUnary('Cosh(number)', Math.cosh),
  tanh: solidScriptNumbersUnary('Tanh(number)', Math.tanh),
  gcd: (args) => solidScriptNumbersGcd(...solidScriptNumbersWhole(args, 'Gcd(a, b)')),
  lcm: (args) => {
    const [a, b] = solidScriptNumbersWhole(args, 'Lcm(a, b)');
    return a === 0 || b === 0 ? 0 : (a / solidScriptNumbersGcd(a, b)) * b;
  },
  xor: (args) => {
    if (args.length !== 2) throw new Error('Xor(a, b) takes two values');
    return solidScriptValueTruthy(args[0]) !== solidScriptValueTruthy(args[1]);
  },
  div_floor: (args) => {
    const usage = 'DivFloor(a, b)';
    const divisor = solidScriptExtraNumber(args, 1, usage);
    if (divisor === 0) throw new Error(`${usage} cannot divide by 0`);
    return Math.floor(solidScriptExtraNumber(args, 0, usage) / divisor);
  },
  bit_and: solidScriptNumbersBits('BitAnd(a, b)', (a, b) => a & b),
  bit_or: solidScriptNumbersBits('BitOr(a, b)', (a, b) => a | b),
  bit_xor: solidScriptNumbersBits('BitXor(a, b)', (a, b) => a ^ b),
  bit_not: (args) => ~Math.round(solidScriptExtraNumber(args, 0, 'BitNot(a)')),
  bit_shift: solidScriptNumbersBits('BitShift(a, shift)', (a, shift) => {
    const steps = Math.max(-31, Math.min(31, shift));
    return steps >= 0 ? a << steps : a >> -steps;
  }),
  bit_rotate: solidScriptNumbersBits('BitRotate(a, shift)', (a, shift) => {
    const steps = ((shift % 32) + 32) % 32;
    return (a << steps) | (a >>> (32 - steps));
  }),
  median: (args) => {
    const sorted = solidScriptNumbersSorted(args, 'Median(list)');
    const middle = Math.floor(sorted.length / 2);
    const high = sorted[middle] ?? 0;
    return sorted.length % 2 === 1 ? high : (high + (sorted[middle - 1] ?? high)) / 2;
  },
  range: (args) => {
    const sorted = solidScriptNumbersSorted(args, 'Range(list)');
    return (sorted.at(-1) ?? 0) - (sorted[0] ?? 0);
  },
  std_dev: solidScriptNumbersSpread('StdDev(list, groups)', Math.sqrt),
  variance: solidScriptNumbersSpread('Variance(list, groups)', (variance) => variance),
} satisfies Readonly<Record<string, SolidScriptNumbersBuiltin>>;
