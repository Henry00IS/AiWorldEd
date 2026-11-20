import { SOLID_SCRIPT_GEOMETRY_EPSILON } from './solid_script_geometry.js';
import {
  SolidScriptElement,
  solidScriptValueNumber,
  solidScriptValueNumbers,
  type SolidScriptValue,
} from './solid_script_value.js';

/** How an element's box is tested against a target box. */
export type SolidScriptHitsHow = 'Touching' | 'Overlapping' | 'Fully Inside';

/**
 * How when the last argument is left off: any contact, including sitting
 * inside.
 */
export const SOLID_SCRIPT_HITS_HOW_DEFAULT: SolidScriptHitsHow = 'Touching';

/** Official How words for Hits and HitsBox. */
export const SOLID_SCRIPT_HITS_HOW_WORDS: readonly SolidScriptHitsHow[] = ['Touching', 'Overlapping', 'Fully Inside'];

/** An axis-aligned box, as min and max corners. */
export interface SolidScriptHitsBox {
  /** Least x, y, z. */
  min: readonly number[];
  /** Greatest x, y, z. */
  max: readonly number[];
}

/** Reads the axis-aligned box around geometry elements of the running script. */
export type SolidScriptHitsBounds = (items: readonly SolidScriptElement[]) => SolidScriptHitsBox;

/**
 * Reads a How word. Empty text means Touching.
 *
 * @param value Argument, or undefined when the call left How off.
 * @returns How, or undefined when the word is not one of the choices.
 */
export function solidScriptHitsHowOf(value: SolidScriptValue | undefined): SolidScriptHitsHow | undefined {
  if (value === undefined || (typeof value === 'string' && value.trim() === '')) return SOLID_SCRIPT_HITS_HOW_DEFAULT;
  if (typeof value !== 'string') return undefined;
  const word = value.trim().toLowerCase();
  return SOLID_SCRIPT_HITS_HOW_WORDS.find((entry) => entry.toLowerCase() === word);
}

/**
 * Builds a box from a Center and Size, the same way InBox does: one number for
 * Size is used on every axis.
 *
 * @param center Center of the box.
 * @param size Width, height and depth, or one number for every axis.
 * @returns Box, or undefined when the values do not fit.
 */
export function solidScriptHitsBoxFromCenterSize(
  center: readonly number[],
  size: readonly number[],
): SolidScriptHitsBox | undefined {
  if (center.length !== 3) return undefined;
  const extent = size.length === 1 ? [size[0], size[0], size[0]] : size;
  if (extent.length !== 3) return undefined;
  return {
    min: extent.map((length, axis) => (center[axis] ?? 0) - Math.abs(length ?? 0) / 2),
    max: extent.map((length, axis) => (center[axis] ?? 0) + Math.abs(length ?? 0) / 2),
  };
}

/**
 * Tells whether two boxes have any contact, including a shared face, edge or
 * corner, and including one sitting inside the other.
 *
 * @param left One box.
 * @param right Other box.
 * @returns Yes when they touch.
 */
export function solidScriptHitsTouching(left: SolidScriptHitsBox, right: SolidScriptHitsBox): boolean {
  for (let axis = 0; axis < 3; axis += 1)
    if ((left.max[axis] ?? 0) < (right.min[axis] ?? 0) - SOLID_SCRIPT_GEOMETRY_EPSILON) return false;
    else if ((right.max[axis] ?? 0) < (left.min[axis] ?? 0) - SOLID_SCRIPT_GEOMETRY_EPSILON) return false;
  return true;
}

/**
 * Tells whether two boxes share interior space. A shared face, edge or corner
 * is not enough.
 *
 * @param left One box.
 * @param right Other box.
 * @returns Yes when the interiors overlap.
 */
export function solidScriptHitsOverlapping(left: SolidScriptHitsBox, right: SolidScriptHitsBox): boolean {
  if (solidScriptHitsFlat(left) || solidScriptHitsFlat(right)) return false;
  for (let axis = 0; axis < 3; axis += 1)
    if ((left.max[axis] ?? 0) <= (right.min[axis] ?? 0) + SOLID_SCRIPT_GEOMETRY_EPSILON) return false;
    else if ((right.max[axis] ?? 0) <= (left.min[axis] ?? 0) + SOLID_SCRIPT_GEOMETRY_EPSILON) return false;
  return true;
}

/**
 * Tells whether a box has no interior, such as a point or a face aligned to an
 * axis.
 *
 * @param box Box.
 * @returns True when any side is no thicker than the epsilon.
 */
function solidScriptHitsFlat(box: SolidScriptHitsBox): boolean {
  for (let axis = 0; axis < 3; axis += 1)
    if ((box.max[axis] ?? 0) - (box.min[axis] ?? 0) <= 2 * SOLID_SCRIPT_GEOMETRY_EPSILON) return true;
  return false;
}

/**
 * Tells whether the inner box lies fully in the outer box, including resting on
 * its faces.
 *
 * @param inner Box that must sit inside.
 * @param outer Box that must contain it.
 * @returns Yes when the inner box is fully inside.
 */
export function solidScriptHitsInside(inner: SolidScriptHitsBox, outer: SolidScriptHitsBox): boolean {
  for (let axis = 0; axis < 3; axis += 1)
    if ((inner.min[axis] ?? 0) < (outer.min[axis] ?? 0) - SOLID_SCRIPT_GEOMETRY_EPSILON) return false;
    else if ((inner.max[axis] ?? 0) > (outer.max[axis] ?? 0) + SOLID_SCRIPT_GEOMETRY_EPSILON) return false;
  return true;
}

/**
 * Tests one element box against one target box with a How word.
 *
 * @param element Box of the element.
 * @param target Box to test against.
 * @param how How they must meet.
 * @returns Yes when the test holds.
 */
export function solidScriptHitsHolds(
  element: SolidScriptHitsBox,
  target: SolidScriptHitsBox,
  how: SolidScriptHitsHow,
): boolean {
  if (how === 'Overlapping') return solidScriptHitsOverlapping(element, target);
  if (how === 'Fully Inside') return solidScriptHitsInside(element, target);
  return solidScriptHitsTouching(element, target);
}

/**
 * Builds the union of boxes, for a first reject against a list of targets.
 *
 * @param boxes Boxes, at least one.
 * @returns Box that contains them all, or undefined when there are none.
 */
export function solidScriptHitsUnion(boxes: readonly SolidScriptHitsBox[]): SolidScriptHitsBox | undefined {
  const first = boxes[0];
  if (!first) return undefined;
  const min = [...first.min];
  const max = [...first.max];
  for (const box of boxes.slice(1))
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis] ?? 0, box.min[axis] ?? 0);
      max[axis] = Math.max(max[axis] ?? 0, box.max[axis] ?? 0);
    }
  return { min, max };
}

/**
 * Tests one element box against each target, using the union as a fast reject
 * when there are several.
 *
 * @param element Box of the element.
 * @param targets Boxes to test against.
 * @param how How they must meet.
 * @returns Yes when any target holds.
 */
export function solidScriptHitsAny(
  element: SolidScriptHitsBox,
  targets: readonly SolidScriptHitsBox[],
  how: SolidScriptHitsHow,
): boolean {
  if (targets.length === 0) return false;
  if (targets.length > 1) {
    const union = solidScriptHitsUnion(targets);
    if (union && !solidScriptHitsHolds(element, union, how === 'Fully Inside' ? 'Fully Inside' : 'Touching'))
      return false;
  }
  return targets.some((target) => solidScriptHitsHolds(element, target, how));
}

/**
 * Reads a Center or Size argument: a 3-vector, or one number for a uniform
 * Size.
 *
 * @param value Argument.
 * @param uniform Whether one number may stand for a uniform size.
 * @returns Numbers, or undefined.
 */
function solidScriptHitsVector(value: SolidScriptValue, uniform: boolean): number[] | undefined {
  const numbers = solidScriptValueNumbers(value);
  if (numbers && numbers.length === 3) return numbers;
  const size = solidScriptValueNumber(value);
  return uniform && size !== undefined ? [size] : undefined;
}

/**
 * Reads the box of one value: a point, an element, or the union of a list of
 * them.
 *
 * @param value Geometry, a point, or a list.
 * @param bounds Reads the box of elements in the running script.
 * @returns Box, or undefined when the value has no box.
 */
export function solidScriptHitsBoxOf(
  value: SolidScriptValue,
  bounds: SolidScriptHitsBounds,
): SolidScriptHitsBox | undefined {
  const point = solidScriptHitsVector(value, false);
  if (point) return { min: point, max: point };
  const items = solidScriptHitsElements(value);
  return items ? bounds(items) : undefined;
}

/**
 * Lists the elements in a value: one element, or a list of them.
 *
 * @param value Geometry or a list.
 * @returns Elements, or undefined when the value is not geometry.
 */
function solidScriptHitsElements(value: SolidScriptValue): SolidScriptElement[] | undefined {
  if (value instanceof SolidScriptElement && value.kind !== 'data') return [value];
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const items: SolidScriptElement[] = [];
  for (const item of value) {
    if (!(item instanceof SolidScriptElement) || item.kind === 'data') return undefined;
    items.push(item);
  }
  return items;
}

/**
 * Lists the target boxes of a Hits() target: each item of a list, or one box.
 *
 * @param value Geometry, a point, or a list of them.
 * @param bounds Reads the box of elements in the running script.
 * @returns Boxes, or undefined when the value has no box.
 */
export function solidScriptHitsTargetBoxes(
  value: SolidScriptValue,
  bounds: SolidScriptHitsBounds,
): SolidScriptHitsBox[] | undefined {
  if (Array.isArray(value) && value.length > 0 && value.every((item) => item instanceof SolidScriptElement)) {
    const boxes = value.map((item) => solidScriptHitsBoxOf(item, bounds));
    return boxes.every((box) => box !== undefined) ? boxes : undefined;
  }
  const box = solidScriptHitsBoxOf(value, bounds);
  return box ? [box] : undefined;
}

/**
 * Hits(element, target, how): yes when the element's box meets the target's
 * box, or any item of a list. How is Touching when left off.
 *
 * @param args Element, target and optional How.
 * @param bounds Reads the box of elements in the running script.
 * @returns Yes or No, or undefined when the values do not fit.
 */
export function solidScriptHits(args: readonly SolidScriptValue[], bounds: SolidScriptHitsBounds): SolidScriptValue {
  const howArg = args.length >= 3 ? args[2] : undefined;
  const how = solidScriptHitsHowOf(howArg);
  const target = args[1];
  if (args.length < 2 || args.length > 3 || how === undefined || target === undefined) return undefined;
  const element = solidScriptHitsBoxOf(args[0], bounds);
  const targets = solidScriptHitsTargetBoxes(target, bounds);
  return element && targets ? solidScriptHitsAny(element, targets, how) : undefined;
}

/**
 * HitsBox(element, center, size, how): yes when the element's box meets a box
 * of a Center and Size. How is Touching when left off.
 *
 * @param args Element, center, size and optional How.
 * @param bounds Reads the box of elements in the running script.
 * @returns Yes or No, or undefined when the values do not fit.
 */
export function solidScriptHitsBox(args: readonly SolidScriptValue[], bounds: SolidScriptHitsBounds): SolidScriptValue {
  const howArg = args.length >= 4 ? args[3] : undefined;
  const how = solidScriptHitsHowOf(howArg);
  if (args.length < 3 || args.length > 4 || how === undefined) return undefined;
  const element = solidScriptHitsBoxOf(args[0], bounds);
  const center = solidScriptHitsVector(args[1], false);
  const size = solidScriptHitsVector(args[2], true);
  const target = center && size ? solidScriptHitsBoxFromCenterSize(center, size) : undefined;
  return element && target ? solidScriptHitsHolds(element, target, how) : undefined;
}
