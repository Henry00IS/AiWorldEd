import type { SolidScriptPath, SolidScriptPathSegment } from './solid_script_path_model.js';
import { solidScriptPathCatmullHandles } from './solid_script_path_splines.js';

/** A point or handle: X, Y and Z. */
type SolidScriptSubdividePoint = number[];

/**
 * A Bezier stretch: start, the handle it leaves toward, the handle its end is
 * reached from, end.
 */
type SolidScriptSubdivideCurve = [
  SolidScriptSubdividePoint,
  SolidScriptSubdividePoint,
  SolidScriptSubdividePoint,
  SolidScriptSubdividePoint,
];

/**
 * What one stretch becomes: the points inside it and the stretches between
 * them.
 */
interface SolidScriptSubdivideStretch {
  points: SolidScriptSubdividePoint[];
  segments: SolidScriptPathSegment<number[]>[];
}

/**
 * Mixes two points.
 *
 * @param a First point.
 * @param b Second point.
 * @param t Share of the second, from 0 to 1.
 * @returns Point.
 */
function solidScriptSubdivideMix(a: readonly number[], b: readonly number[], t: number): SolidScriptSubdividePoint {
  return a.map((value, axis) => value + ((b[axis] ?? value) - value) * t);
}

/**
 * Splits a Bezier stretch in two at a place along it, both halves keeping its
 * shape.
 *
 * @param curve Stretch.
 * @param t Place to split at, from 0 to 1.
 * @returns First half and second half.
 */
function solidScriptSubdivideSplit(
  [start, out, into, end]: SolidScriptSubdivideCurve,
  t: number,
): [SolidScriptSubdivideCurve, SolidScriptSubdivideCurve] {
  const a = solidScriptSubdivideMix(start, out, t);
  const b = solidScriptSubdivideMix(out, into, t);
  const c = solidScriptSubdivideMix(into, end, t);
  const ab = solidScriptSubdivideMix(a, b, t);
  const bc = solidScriptSubdivideMix(b, c, t);
  const middle = solidScriptSubdivideMix(ab, bc, t);
  return [
    [start, a, ab, middle],
    [middle, bc, c, end],
  ];
}

/**
 * Cuts a Bezier stretch into even parts by place along it.
 *
 * @param curve Stretch.
 * @param cuts Cuts to make.
 * @returns Parts, in order.
 */
function solidScriptSubdivideCurve(curve: SolidScriptSubdivideCurve, cuts: number): SolidScriptSubdivideCurve[] {
  const parts: SolidScriptSubdivideCurve[] = [];
  let rest = curve;
  for (let cut = 0; cut < cuts; cut++) {
    const [part, after] = solidScriptSubdivideSplit(rest, 1 / (cuts + 1 - cut));
    parts.push(part);
    rest = after;
  }
  return [...parts, rest];
}

/**
 * Cuts one stretch of a path: a Bezier stretch keeps its shape, a Catmull Rom
 * path gets points on its curve, and a straight stretch or a NURBS path gets
 * points evenly along the line between its points.
 *
 * @param path Path.
 * @param index Stretch number.
 * @param cuts Cuts to make.
 * @returns Points inside the stretch and its new stretches.
 */
function solidScriptSubdivideStretch(
  path: SolidScriptPath<number[]>,
  index: number,
  cuts: number,
): SolidScriptSubdivideStretch {
  const start = path.points[index] ?? [];
  const end = path.points[(index + 1) % path.points.length] ?? start;
  const segment = path.segments[index];
  const curve = solidScriptSubdivideCurveOf(path, index, start, end);
  if (!curve) {
    const points = Array.from({ length: cuts }, (_, cut) =>
      solidScriptSubdivideMix(start, end, (cut + 1) / (cuts + 1)),
    );
    return { points, segments: Array.from({ length: cuts + 1 }, () => ({ kind: 'line' as const })) };
  }
  const parts = solidScriptSubdivideCurve(curve, cuts);
  const resolution = segment?.kind === 'bezier' ? segment.resolution : 0;
  const segments = parts.map(([, out, into]): SolidScriptPathSegment<number[]> =>
    segment?.kind === 'bezier' ? { kind: 'bezier', out, in: into, resolution } : { kind: 'line' },
  );
  return { points: parts.slice(1).map(([point]) => point), segments };
}

/**
 * Gives the Bezier stretch a stretch runs along: its own on a Bezier stretch,
 * its curve's on a Catmull Rom path, else none.
 *
 * @param path Path.
 * @param index Stretch number.
 * @param start Its start.
 * @param end Its end.
 * @returns Stretch, or undefined when it runs straight.
 */
function solidScriptSubdivideCurveOf(
  path: SolidScriptPath<number[]>,
  index: number,
  start: SolidScriptSubdividePoint,
  end: SolidScriptSubdividePoint,
): SolidScriptSubdivideCurve | undefined {
  const segment = path.segments[index];
  if (path.spline?.kind === 'catmull') {
    const handles = solidScriptPathCatmullHandles(path.points, path.closed);
    const after = (index + 1) % path.points.length;
    return [start, handles.right[index] ?? start, handles.left[after] ?? end, end];
  }
  if (path.spline || segment?.kind !== 'bezier') return undefined;
  return [start, segment.out, segment.in, end];
}

/**
 * Gives the tilts of the points a stretch's cuts make, evenly between the tilts
 * of its ends.
 *
 * @param path Path.
 * @param index Stretch number.
 * @param cuts Cuts made.
 * @returns Tilts in degrees.
 */
function solidScriptSubdivideTilts(path: SolidScriptPath<number[]>, index: number, cuts: number): number[] {
  const from = path.tilts?.[index] ?? 0;
  const to = path.tilts?.[(index + 1) % path.points.length] ?? 0;
  return Array.from({ length: cuts }, (_, cut) => from + ((to - from) * (cut + 1)) / (cuts + 1));
}

/**
 * Cuts every stretch of a path into even parts, keeping its shape, closing,
 * curve kind and tilts; new points get the tilt between their neighbours.
 *
 * @param path Path.
 * @param cuts Cuts in each stretch, by the point it starts at.
 * @returns Path.
 */
export function solidScriptPathSubdivide(
  path: SolidScriptPath<number[]>,
  cuts: readonly number[],
): SolidScriptPath<number[]> {
  const points: SolidScriptSubdividePoint[] = [];
  const segments: SolidScriptPathSegment<number[]>[] = [];
  const tilts: number[] = [];
  path.points.forEach((point, index) => {
    points.push(point);
    tilts.push(path.tilts?.[index] ?? 0);
    if (index >= path.segments.length) return;
    const stretch = solidScriptSubdivideStretch(path, index, cuts[index] ?? 0);
    points.push(...stretch.points);
    segments.push(...stretch.segments);
    tilts.push(...solidScriptSubdivideTilts(path, index, stretch.points.length));
  });
  return { ...path, points, segments, ...(path.tilts ? { tilts } : {}) };
}
