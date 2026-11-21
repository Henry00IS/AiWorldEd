import { solidScriptValueNumbers, type SolidScriptValue } from './solid_script_value.js';

/** Built-in function implementation over evaluated positional arguments. */
type SolidScriptBuiltin = (args: SolidScriptValue[]) => SolidScriptValue;

/**
 * Size of the vectors among the arguments, when any argument is a vector.
 *
 * @param args Arguments.
 * @param usage How to call the function, for the message.
 * @returns Vector size, or 0 when every argument is a number.
 */
function solidScriptAxesSize(args: readonly SolidScriptValue[], usage: string): number {
  const sizes = new Set(args.flatMap((arg) => (Array.isArray(arg) ? [solidScriptAxesNumbers(arg, usage).length] : [])));
  if (sizes.size > 1) throw new Error(`${usage} needs vectors of the same size`);
  return [...sizes][0] ?? 0;
}

/**
 * Reads a vector argument as numbers.
 *
 * @param arg Vector.
 * @param usage How to call the function, for the message.
 * @returns Numbers.
 */
function solidScriptAxesNumbers(arg: SolidScriptValue, usage: string): number[] {
  const numbers = solidScriptValueNumbers(arg);
  if (!numbers) throw new Error(`${usage} needs numbers or vectors of numbers`);
  return numbers;
}

/**
 * Makes a function of numbers work on vectors too, one axis at a time: each
 * vector gives its value on that axis and a number stays the same on every
 * axis, so Floor(1.5, -1.5, 2) gives 1, -2, 2 and Snap(vector, 0.5) snaps each
 * axis.
 *
 * @param usage How to call the function, for the message.
 * @param operation Function of numbers.
 * @returns Function of numbers or vectors.
 */
export function solidScriptAxesEach(usage: string, operation: SolidScriptBuiltin): SolidScriptBuiltin {
  return (args) => {
    const size = solidScriptAxesSize(args, usage);
    if (size === 0) return operation(args);
    return Array.from({ length: size }, (_, axis) =>
      operation(args.map((arg) => (Array.isArray(arg) ? solidScriptAxesNumbers(arg, usage)[axis] : arg))),
    );
  };
}

/**
 * Min or Max: two or more vectors give the lowest or highest on each axis; one
 * list gives its lowest or highest number, as do numbers.
 *
 * @param usage How to call the function, for the message.
 * @param pick Math.min or Math.max.
 * @returns Built-in.
 */
export function solidScriptAxesPick(usage: string, pick: (...values: number[]) => number): SolidScriptBuiltin {
  const each = solidScriptAxesEach(usage, (args) => pick(...args.map(Number)));
  return (args) => {
    if (args.length > 1 && args.every(Array.isArray)) return each(args);
    const list = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    return pick(...(solidScriptValueNumbers(list) ?? []));
  };
}
