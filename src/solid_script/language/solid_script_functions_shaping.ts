import * as THREE from 'three';
import { solidScriptAxesEach } from './solid_script_functions_axes.js';
import { solidScriptExtraNumber } from './solid_script_functions_extra.js';
import { SOLID_SCRIPT_LIMITS, solidScriptListLimitCheck } from './solid_script_limits.js';
import {
  solidScriptValueNumbers,
  solidScriptValueText,
  solidScriptValueTruthy,
  type SolidScriptValue,
} from './solid_script_value.js';

/** How to call Remap, for messages. */
const SOLID_SCRIPT_SHAPING_REMAP_USAGE = 'Remap(value, from_low, from_high, to_low, to_high, clamp, steps, ease)';

/** A built-in function over evaluated arguments. */
type SolidScriptShaping = (args: SolidScriptValue[]) => SolidScriptValue;

/**
 * The smaller of two numbers, rounded off where they come within a distance of
 * each other so the switch from one to the other has no corner.
 *
 * @param a First number.
 * @param b Second number.
 * @param distance How far apart they blend; 0 is a plain minimum.
 * @returns Blended minimum.
 */
function solidScriptShapingSmoothMin(a: number, b: number, distance: number): number {
  if (distance <= 0) return Math.min(a, b);
  const blend = Math.max(distance - Math.abs(a - b), 0) / distance;
  return Math.min(a, b) - (blend * blend * distance) / 4;
}

/**
 * Bounces a number back and forth between 0 and a length.
 *
 * @param value Number.
 * @param length Top of the bounce; 0 gives 0.
 * @returns Number from 0 to length.
 */
function solidScriptShapingPingPong(value: number, length: number): number {
  if (length === 0) return 0;
  const span = Math.abs(length) * 2;
  const along = ((value % span) + span) % span;
  return Math.abs(length) - Math.abs(along - Math.abs(length));
}

/**
 * Snaps a 0-to-1 amount to the nearest of Steps + 1 even levels from 0 to 1; no
 * Steps given, or Steps 0, leaves it smooth.
 *
 * @param amount Amount from the low end to the high end.
 * @param args Remap arguments, with Steps seventh.
 * @param usage How to call the function, for the message.
 * @returns Stepped amount.
 */
function solidScriptShapingSteps(amount: number, args: readonly SolidScriptValue[], usage: string): number {
  const steps = args.length > 6 ? Math.round(solidScriptExtraNumber(args, 6, usage)) : 0;
  if (steps < 0) throw new Error(`${usage} needs Steps of 0 or more`);
  return steps === 0 ? amount : Math.round(amount * steps) / steps;
}

/**
 * Eases a blend gently at both edges, when Ease asks; otherwise leaves it
 * linear, including amounts past the ends.
 *
 * @param amount Blend amount.
 * @param args Remap arguments, with Ease eighth.
 * @param usage How to call the function, for the message.
 * @returns Eased amount.
 */
function solidScriptShapingEase(amount: number, args: readonly SolidScriptValue[], usage: string): number {
  const ease = args.length > 7 ? solidScriptValueText(args[7]).toLowerCase() : 'linear';
  if (ease === 'linear') return amount;
  if (ease === 'smoothstep') return THREE.MathUtils.smoothstep(amount, 0, 1);
  if (ease === 'smootherstep') return THREE.MathUtils.smootherstep(amount, 0, 1);
  throw new Error(`${usage} needs Ease Linear, Smoothstep or Smootherstep`);
}

/**
 * Moves a number from one range into another, kept inside the target range when
 * clamped, and in steps when Steps is given.
 *
 * @param args Value, the two ranges, Clamp, Steps and Ease.
 * @returns Number.
 */
function solidScriptShapingRemap(args: readonly SolidScriptValue[]): number {
  const usage = SOLID_SCRIPT_SHAPING_REMAP_USAGE;
  const [value, fromLow, fromHigh, toLow, toHigh] = [0, 1, 2, 3, 4].map((index) =>
    solidScriptExtraNumber(args, index, usage),
  ) as [number, number, number, number, number];
  if (fromHigh === fromLow) throw new Error(`${usage} needs from_low and from_high to differ`);
  const stepped = solidScriptShapingSteps((value - fromLow) / (fromHigh - fromLow), args, usage);
  const amount = solidScriptShapingEase(stepped, args, usage);
  const mapped = toLow + amount * (toHigh - toLow);
  const clamp = args.length < 6 || solidScriptValueTruthy(args[5] ?? true);
  return clamp ? Math.min(Math.max(toLow, toHigh), Math.max(Math.min(toLow, toHigh), mapped)) : mapped;
}

/** How to call Accumulate, for messages. */
const SOLID_SCRIPT_SHAPING_ACCUMULATE_USAGE = 'Accumulate(list, groups, output)';

/** What Accumulate gives for each item. */
const SOLID_SCRIPT_SHAPING_ACCUMULATE_OUTPUTS = ['Leading', 'Trailing', 'Total'] as const;

/**
 * Reads Accumulate's items as numbers or vectors, each as its parts.
 *
 * @param value The list.
 * @returns Parts of every item, and whether the items are vectors.
 */
function solidScriptShapingAccumulateItems(value: SolidScriptValue): { items: number[][]; vectors: boolean } {
  const list = Array.isArray(value) ? value : undefined;
  const vectors = Array.isArray(list?.[0]);
  const items = list?.map((item) => (vectors ? solidScriptValueNumbers(item) : solidScriptValueNumbers([item])));
  if (!items?.every((item) => item?.length === (vectors ? 3 : 1)))
    throw new Error(
      `${SOLID_SCRIPT_SHAPING_ACCUMULATE_USAGE} needs a list of numbers or vectors, not ${solidScriptValueText(value)}`,
    );
  return { items: items as number[][], vectors };
}

/**
 * Reads the group key of every item: one group for all when Groups is empty.
 *
 * @param value Groups.
 * @param count Number of items.
 * @returns Key per item.
 */
function solidScriptShapingAccumulateGroups(value: SolidScriptValue | undefined, count: number): string[] {
  const groups = Array.isArray(value) ? value : [];
  if (groups.length === 0) return Array.from({ length: count }, () => '');
  if (groups.length !== count)
    throw new Error(`${SOLID_SCRIPT_SHAPING_ACCUMULATE_USAGE} needs one group per item in Groups, or none`);
  return groups.map((group) => solidScriptValueText(group));
}

/**
 * Sums of a list of numbers or vectors, within each group in list order:
 * Leading up to and including each item, Trailing before it, or the Total.
 *
 * @param args The list, optional Groups and optional Output.
 * @returns A sum per item.
 */
function solidScriptShapingAccumulate(args: readonly SolidScriptValue[]): SolidScriptValue[] {
  const { items, vectors } = solidScriptShapingAccumulateItems(args[0]);
  const keys = solidScriptShapingAccumulateGroups(args[1], items.length);
  const output = solidScriptValueText(args[2] ?? 'Leading');
  if (!SOLID_SCRIPT_SHAPING_ACCUMULATE_OUTPUTS.some((name) => name === output))
    throw new Error(`${SOLID_SCRIPT_SHAPING_ACCUMULATE_USAGE} needs Output Leading, Trailing or Total, not ${output}`);
  const add = (a: number[], b: number[]): number[] => a.map((part, axis) => part + (b[axis] ?? 0));
  const zero = (items[0] ?? [0]).map(() => 0);
  const totals = new Map<string, number[]>();
  for (const [index, key] of keys.entries()) totals.set(key, add(totals.get(key) ?? zero, items[index] ?? zero));
  const running = new Map<string, number[]>();
  const sums = items.map((item, index) => {
    const key = keys[index] ?? '';
    const before = running.get(key) ?? zero;
    running.set(key, add(before, item));
    return output === 'Total' ? (totals.get(key) ?? zero) : output === 'Trailing' ? before : add(before, item);
  });
  return sums.map((sum) => (vectors ? sum : (sum[0] ?? 0)));
}

/** What Duplicate gives per result. */
const SOLID_SCRIPT_SHAPING_DUPLICATE_OUTPUTS = ['Items', 'Copy', 'Source'] as const;

/** How to call Duplicate, for messages. */
const SOLID_SCRIPT_SHAPING_DUPLICATE_USAGE = 'Duplicate(list, counts, output)';

/**
 * Reads how many copies each item gets: one Count for all, or one per item;
 * stops when the copies would pass the list cap.
 *
 * @param value Counts.
 * @param size Number of items.
 * @returns Count per item.
 */
function solidScriptShapingDuplicateCounts(value: SolidScriptValue, size: number): number[] {
  const counts = Array.isArray(value) ? solidScriptValueNumbers(value) : solidScriptValueNumbers([value ?? 1]);
  if (!counts?.every((count) => Number.isInteger(count) && count >= 0))
    throw new Error(`${SOLID_SCRIPT_SHAPING_DUPLICATE_USAGE} needs whole Counts of 0 or more`);
  if (Array.isArray(value) && counts.length !== size)
    throw new Error(`${SOLID_SCRIPT_SHAPING_DUPLICATE_USAGE} needs one Count per item`);
  const each = Array.isArray(value) ? counts : Array.from({ length: size }, () => counts[0] ?? 1);
  const total = each.reduce((sum, count) => sum + count, 0);
  solidScriptListLimitCheck(new Array(Math.min(total, SOLID_SCRIPT_LIMITS.listItems + 1)));
  return each;
}

/**
 * Repeats every item of a list its Count times, in list order; Output Copy
 * gives each result's copy number from 0 instead, and Source the position of
 * the item it came from.
 *
 * @param args The list, Counts and optional Output.
 * @returns Results.
 */
function solidScriptShapingDuplicate(args: readonly SolidScriptValue[]): SolidScriptValue[] {
  const list = args[0];
  if (!Array.isArray(list))
    throw new Error(`${SOLID_SCRIPT_SHAPING_DUPLICATE_USAGE} needs a list, not ${solidScriptValueText(list)}`);
  const counts = solidScriptShapingDuplicateCounts(args.length > 1 ? args[1] : 1, list.length);
  const output = solidScriptValueText(args[2] ?? 'Items');
  if (!SOLID_SCRIPT_SHAPING_DUPLICATE_OUTPUTS.some((name) => name === output))
    throw new Error(`${SOLID_SCRIPT_SHAPING_DUPLICATE_USAGE} needs Output Items, Copy or Source, not ${output}`);
  return list.flatMap((item, source) =>
    Array.from({ length: counts[source] ?? 0 }, (_, copy) =>
      output === 'Copy' ? copy : output === 'Source' ? source : item,
    ),
  );
}

/** How to call Chunks, for messages. */
const SOLID_SCRIPT_SHAPING_CHUNKS_USAGE = 'Chunks(list, sizes)';

/**
 * Reads the size of every chunk: one Size for all, the last taking what is
 * left, or one per chunk adding up to the whole list.
 *
 * @param value Sizes.
 * @param size Number of items.
 * @returns Size per chunk.
 */
function solidScriptShapingChunkSizes(value: SolidScriptValue, size: number): number[] {
  if (!Array.isArray(value)) {
    const each = solidScriptValueNumbers([value ?? 1])?.[0] ?? 0;
    if (!Number.isInteger(each) || each < 1)
      throw new Error(`${SOLID_SCRIPT_SHAPING_CHUNKS_USAGE} needs whole Sizes of 1 or more, such as 2`);
    return Array.from({ length: Math.ceil(size / each) }, (_, chunk) => Math.min(each, size - chunk * each));
  }
  const sizes = solidScriptValueNumbers(value);
  if (!sizes?.every((part) => Number.isInteger(part) && part >= 0))
    throw new Error(`${SOLID_SCRIPT_SHAPING_CHUNKS_USAGE} needs whole Sizes of 0 or more, such as List(2, 3)`);
  const total = sizes.reduce((sum, part) => sum + part, 0);
  if (total !== size)
    throw new Error(`${SOLID_SCRIPT_SHAPING_CHUNKS_USAGE} needs Sizes that add up to ${size}, not ${total}`);
  return sizes;
}

/**
 * Splits a flat list into lists of the given sizes, in list order, such as a
 * list of points into one list per path.
 *
 * @param args The list and Sizes.
 * @returns One list per chunk.
 */
function solidScriptShapingChunks(args: readonly SolidScriptValue[]): SolidScriptValue[] {
  const list = args[0];
  if (!Array.isArray(list))
    throw new Error(`${SOLID_SCRIPT_SHAPING_CHUNKS_USAGE} needs a list, not ${solidScriptValueText(list)}`);
  const sizes = solidScriptShapingChunkSizes(args.length > 1 ? args[1] : 1, list.length);
  let start = 0;
  return sizes.map((part) => {
    const chunk = list.slice(start, start + part);
    start += part;
    return chunk;
  });
}

/**
 * Finds which unit square along one axis a value lies in. A value within a
 * billionth of a whole number counts as lying on that edge, and an edge belongs
 * to the square below it.
 *
 * @param value Scaled coordinate.
 * @returns Whole number of the square.
 */
function solidScriptShapingSquare(value: number): number {
  const edge = Math.round(value);
  return Math.abs(value - edge) < 1e-9 ? edge - 1 : Math.floor(value);
}

/**
 * Says whether a point falls in an odd square of a checkerboard of unit
 * squares, scaled; points on a square's edge belong to the square below.
 *
 * @param args Position, as a number or vector, and the scale.
 * @returns 1 in an odd square, 0 in an even one.
 */
function solidScriptShapingChecker(args: readonly SolidScriptValue[]): number {
  const usage = 'Checker(position, scale)';
  const scale = args.length > 1 ? solidScriptExtraNumber(args, 1, usage) : 1;
  const position = Array.isArray(args[0]) ? solidScriptValueNumbers(args[0]) : [solidScriptExtraNumber(args, 0, usage)];
  if (!position) throw new Error(`${usage} needs a number or a vector, not ${solidScriptValueText(args[0])}`);
  const squares = position.reduce((total, value) => total + solidScriptShapingSquare(value * scale), 0);
  return Math.abs(squares) % 2;
}

/** What RadialTile gives. */
const SOLID_SCRIPT_SHAPING_RADIAL_OUTPUTS = ['Segment', 'Angle', 'Local', 'Width'] as const;

/** How to call RadialTile, for messages. */
const SOLID_SCRIPT_SHAPING_RADIAL_USAGE = 'RadialTile(position, segments, output, roundness)';

/**
 * Reads the inputs of RadialTile.
 *
 * @param args Position, Segments, optional Output and Roundness.
 * @returns Position as numbers, the number of segments and the output.
 */
function solidScriptShapingRadialInputs(args: readonly SolidScriptValue[]): [number[], number, string] {
  const position = Array.isArray(args[0]) ? solidScriptValueNumbers(args[0]) : null;
  if (!position || position.length < 2)
    throw new Error(`${SOLID_SCRIPT_SHAPING_RADIAL_USAGE} needs a vector, such as Vector(1, 0, 0)`);
  const segments = args.length > 1 ? solidScriptExtraNumber(args, 1, SOLID_SCRIPT_SHAPING_RADIAL_USAGE) : 4;
  if (!Number.isInteger(segments) || segments < 1)
    throw new Error(`${SOLID_SCRIPT_SHAPING_RADIAL_USAGE} needs whole Segments of 1 or more, such as 6`);
  const output = solidScriptValueText(args[2] ?? 'Segment');
  if (!SOLID_SCRIPT_SHAPING_RADIAL_OUTPUTS.some((name) => name === output))
    throw new Error(`${SOLID_SCRIPT_SHAPING_RADIAL_USAGE} needs Output Segment, Angle, Local or Width, not ${output}`);
  return [position, segments, output];
}

/**
 * Reads the Roundness of RadialTile.
 *
 * @param args Arguments.
 * @returns From 0 to 1, 0 when left off.
 */
function solidScriptShapingRadialRoundness(args: readonly SolidScriptValue[]): number {
  const roundness = args.length > 3 ? solidScriptExtraNumber(args, 3, SOLID_SCRIPT_SHAPING_RADIAL_USAGE) : 0;
  if (!(roundness >= 0 && roundness <= 1))
    throw new Error(`${SOLID_SCRIPT_SHAPING_RADIAL_USAGE} needs a Roundness from 0 to 1, such as 0.5`);
  return roundness;
}

/**
 * Cuts the plane round the Z axis into equal wedges, the first centred on X,
 * and tells which wedge a position is in: its number, its centre angle in
 * degrees, the position turned so that wedge points along X, or the length of
 * the wedge's arc at the position's distance from the axis. Roundness moves the
 * X of Local from the distance along the wedge's centre, which is the same all
 * along a straight edge across the wedge, toward the distance from the axis,
 * which is the same all round an arc.
 *
 * @param args Position, Segments, optional Output and Roundness.
 * @returns The chosen output.
 */
function solidScriptShapingRadialTile(args: readonly SolidScriptValue[]): SolidScriptValue {
  const [[x = 0, y = 0, z = 0], segments, output] = solidScriptShapingRadialInputs(args);
  const roundness = solidScriptShapingRadialRoundness(args);
  const step = (Math.PI * 2) / segments;
  const angle = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
  const segment = Math.floor(angle / step + 0.5) % segments;
  const centre = segment * step;
  if (output === 'Segment') return segment;
  if (output === 'Angle') return THREE.MathUtils.radToDeg(centre);
  if (output === 'Width') return Math.hypot(x, y) * step;
  const along = x * Math.cos(centre) + y * Math.sin(centre);
  return [THREE.MathUtils.lerp(along, Math.hypot(x, y), roundness), y * Math.cos(centre) - x * Math.sin(centre), z];
}

/**
 * Shaping functions: smooth minimum and maximum, bounce, ranges, running sums,
 * repeating waves and a checkerboard.
 */
export const SOLID_SCRIPT_FUNCTIONS_SHAPING = {
  smooth_min: solidScriptAxesEach('SmoothMin(a, b, distance)', (args) => {
    const usage = 'SmoothMin(a, b, distance)';
    const [a, b, distance] = [0, 1, 2].map((index) => solidScriptExtraNumber(args, index, usage)) as [
      number,
      number,
      number,
    ];
    return solidScriptShapingSmoothMin(a, b, distance);
  }),
  smooth_max: solidScriptAxesEach('SmoothMax(a, b, distance)', (args) => {
    const usage = 'SmoothMax(a, b, distance)';
    const [a, b, distance] = [0, 1, 2].map((index) => solidScriptExtraNumber(args, index, usage)) as [
      number,
      number,
      number,
    ];
    return -solidScriptShapingSmoothMin(-a, -b, distance);
  }),
  ping_pong: solidScriptAxesEach('PingPong(value, length)', (args) =>
    solidScriptShapingPingPong(
      solidScriptExtraNumber(args, 0, 'PingPong(value, length)'),
      solidScriptExtraNumber(args, 1, 'PingPong(value, length)'),
    ),
  ),
  remap: solidScriptAxesEach(SOLID_SCRIPT_SHAPING_REMAP_USAGE, solidScriptShapingRemap),
  accumulate: solidScriptShapingAccumulate,
  duplicate: solidScriptShapingDuplicate,
  chunks: solidScriptShapingChunks,
  saw: solidScriptAxesEach('Saw(value)', (args) => {
    const value = solidScriptExtraNumber(args, 0, 'Saw(value)');
    return value - Math.floor(value);
  }),
  triangle: solidScriptAxesEach('Triangle(value)', (args) => {
    const value = solidScriptExtraNumber(args, 0, 'Triangle(value)');
    return Math.abs(value - Math.floor(value + 0.5)) * 2;
  }),
  checker: solidScriptShapingChecker,
  radial_tile: solidScriptShapingRadialTile,
} satisfies Readonly<Record<string, SolidScriptShaping>>;
