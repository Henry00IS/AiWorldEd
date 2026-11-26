import { solidScriptPathAt, solidScriptPathDirection, solidScriptPathLength } from './solid_script_path.js';
import { solidScriptPathWalk } from './solid_script_path_model.js';
import { SolidScriptPathElement, type SolidScriptValue } from './solid_script_value.js';
import { solidScriptVectorRead } from './solid_script_vector.js';

/**
 * Points spread along a path, with the way the path runs at each and how far
 * along each is.
 */
export interface SolidScriptPathPoints {
  /** Positions. */
  points: number[][];
  /** Unit direction of the path at each point. */
  directions: number[][];
  /** How far along each point is, from 0 at the start to 1 at the end. */
  amounts: number[];
}

/** How points are spread along a path: a number of them, or a distance apart. */
export type SolidScriptPathSpread = { count: number } | { spacing: number };

/**
 * Reads a Path value or a list of points as the points walked, a closed Path
 * ending back at its start, and whether it is closed.
 *
 * @param given Path value or point list.
 * @returns Points walked and whether the path is closed.
 */
export function solidScriptPathWalked(given: SolidScriptValue): { walked: number[][]; closed: boolean } {
  if (given instanceof SolidScriptPathElement)
    return { walked: solidScriptPathWalk(given.path) as number[][], closed: given.path.closed };
  if (Array.isArray(given) && given.length === 1 && given[0] instanceof SolidScriptPathElement)
    return solidScriptPathWalked(given[0]);
  const points = Array.isArray(given) ? given.map((point) => solidScriptVectorRead(point)) : [];
  if (points.length === 0 || points.some((point) => point === undefined))
    throw new Error('Path needs a Path or a list of points, such as [Path]');
  return { walked: points as number[][], closed: false };
}

/**
 * Lists the distances along a path where its points go. A closed path does not
 * repeat its start at the end; an open one keeps both ends.
 *
 * @param total Length of the path.
 * @param closed Whether it is closed.
 * @param spread Count or spacing.
 * @returns Distances from the start, smallest first.
 */
function solidScriptPathDistances(total: number, closed: boolean, spread: SolidScriptPathSpread): number[] {
  if ('count' in spread) {
    const steps = closed ? spread.count : spread.count - 1;
    return Array.from({ length: spread.count }, (_, index) => (steps > 0 ? (total * index) / steps : 0));
  }
  const whole = Math.floor(total / spread.spacing + 1e-9);
  const distances = Array.from({ length: whole + 1 }, (_, index) => index * spread.spacing);
  if (closed && total - (distances.at(-1) ?? 0) < 1e-6 && distances.length > 1) distances.pop();
  if (!closed && total - whole * spread.spacing > 1e-6) distances.push(total);
  return distances;
}

/**
 * Spreads points along a path by count or spacing, with the path's direction
 * and how far along each point is.
 *
 * @param walked Points walked, at least 2.
 * @param closed Whether the path is closed.
 * @param spread Count or spacing.
 * @returns Points, directions and amounts.
 */
export function solidScriptPathPointsSpread(
  walked: readonly number[][],
  closed: boolean,
  spread: SolidScriptPathSpread,
): SolidScriptPathPoints {
  const usage = 'Points From Path';
  if (walked.length < 2) throw new Error(`${usage} needs a Path with at least 2 points`);
  const total = solidScriptPathLength(walked);
  const amounts = solidScriptPathDistances(total, closed, spread).map((distance) => (total > 0 ? distance / total : 0));
  return {
    points: amounts.map((amount) => solidScriptPathAt(walked, amount, usage)),
    directions: amounts.map((amount) => solidScriptPathDirection(walked, amount, usage)),
    amounts,
  };
}
