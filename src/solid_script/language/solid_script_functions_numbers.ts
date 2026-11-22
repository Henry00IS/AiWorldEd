import { solidScriptAxesEach } from './solid_script_functions_axes.js';
import { solidScriptExtraNumber } from './solid_script_functions_extra.js';
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
  return Math.log(solidScriptExtraNumber(args, 0, usage)) / Math.log(base);
}

/**
 * How far numbers spread from their average: the square root of the average
 * squared distance from it.
 *
 * @param numbers Numbers.
 * @returns Standard deviation.
 */
function solidScriptNumbersDeviation(numbers: readonly number[]): number {
  const mean = numbers.reduce((total, value) => total + value, 0) / numbers.length;
  return Math.sqrt(numbers.reduce((total, value) => total + (value - mean) ** 2, 0) / numbers.length);
}

/**
 * Number helpers: logarithms, hyperbolic functions, whole numbers, bits and
 * list statistics.
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
  bit_and: solidScriptNumbersBits('BitAnd(a, b)', (a, b) => a & b),
  bit_or: solidScriptNumbersBits('BitOr(a, b)', (a, b) => a | b),
  bit_xor: solidScriptNumbersBits('BitXor(a, b)', (a, b) => a ^ b),
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
  std_dev: (args) => solidScriptNumbersDeviation(solidScriptNumbersSorted(args, 'StdDev(list)')),
} satisfies Readonly<Record<string, SolidScriptNumbersBuiltin>>;
