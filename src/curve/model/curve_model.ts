/** How a curve segment bends between its two points. */
export type CurveSegmentMode = 'linear' | 'quadratic' | 'bezier';

/** Every segment mode, in toolbar order. */
export const CURVE_SEGMENT_MODES: readonly CurveSegmentMode[] = ['linear', 'quadratic', 'bezier'];

/** Fewest straight pieces a bent segment is split into. */
export const CURVE_DETAIL_MIN = 1;

/** Most straight pieces a bent segment is split into. */
export const CURVE_DETAIL_MAX = 64;

/** Straight pieces of a newly bent segment. */
export const CURVE_DETAIL_DEFAULT = 8;

/**
 * Largest coordinate difference two equal curves may have, below the stored
 * precision.
 */
export const CURVE_EQUAL_EPSILON = 1e-6;

/** Most points a curve may hold. */
export const CURVE_POINTS_MAX = 256;

/** Offset of a handle from its point, in curve units. */
export interface CurveHandle {
  /** Horizontal offset. */
  x: number;
  /** Vertical offset. */
  y: number;
}

/** One point of a curve with its incoming and outgoing handles. */
export interface CurvePoint {
  /** Position from left (0) to right (1). */
  x: number;
  /** Value from bottom (0) to top (1). */
  y: number;
  /** Handle shaping the segment that ends here. */
  in: CurveHandle;
  /** Handle shaping the segment that starts here. */
  out: CurveHandle;
}

/**
 * Cross-section a revolved segment uses: round follows the generator's side
 * count, square is a four-sided block that fills the bounds at value 1.
 */
export type CurveSegmentSection = 'round' | 'square';

/** One segment between two neighbouring points. */
export interface CurveSegment {
  /** Bend mode. */
  mode: CurveSegmentMode;
  /** Straight pieces a bent segment is split into. */
  detail: number;
  /** Square cross-section; absent means round. */
  section?: 'square';
}

/**
 * Section markers on a curve's x axis, like loop points: below the bottom
 * marker is a fixed-height base, above the top marker a fixed-height top, and
 * the middle stretches. Either may be absent.
 */
export interface CurveMarkers {
  /** Bottom marker x in 0..1. */
  bottom?: number;
  /** Top marker x in 0..1. */
  top?: number;
}

/**
 * A function from left to right on the unit square: points never pass each
 * other, the first sits at x 0 and the last at x 1. Segment i joins point i and
 * point i + 1.
 */
export interface Curve {
  /** Optional section markers on the x axis. */
  markers?: CurveMarkers;
  /** Points from left to right. */
  points: CurvePoint[];
  /** Segments, one fewer than points. */
  segments: CurveSegment[];
}

/** A point on the curve plane. */
export interface CurveVector {
  /** Horizontal position. */
  x: number;
  /** Vertical position. */
  y: number;
}

/**
 * Creates a point without handles.
 *
 * @param x Horizontal position.
 * @param y Vertical position.
 * @returns Point.
 */
export function curvePointCreate(x: number, y: number): CurvePoint {
  return { x, y, in: { x: 0, y: 0 }, out: { x: 0, y: 0 } };
}

/**
 * Creates a linear segment.
 *
 * @returns Segment.
 */
export function curveSegmentLinear(): CurveSegment {
  return { mode: 'linear', detail: CURVE_DETAIL_DEFAULT };
}

/**
 * Builds a curve of straight segments through points.
 *
 * @param points Pairs of x and y, left to right.
 * @returns Curve.
 */
export function curveFromPolyline(points: readonly (readonly [number, number])[]): Curve {
  const curvePoints = points.map(([x, y]) => curvePointCreate(x, y));
  return { points: curvePoints, segments: curvePoints.slice(1).map(() => curveSegmentLinear()) };
}

/**
 * Deep-copies a curve.
 *
 * @param curve Curve.
 * @returns Independent copy.
 */
export function curveClone(curve: Curve): Curve {
  return {
    points: curve.points.map((point) => ({ x: point.x, y: point.y, in: { ...point.in }, out: { ...point.out } })),
    segments: curve.segments.map((segment) => ({ ...segment })),
    ...(curve.markers ? { markers: { ...curve.markers } } : {}),
  };
}

/**
 * Returns the absolute position of a point's handle.
 *
 * @param point Curve point.
 * @param side 'in' or 'out'.
 * @returns Handle position.
 */
export function curveHandlePosition(point: CurvePoint, side: 'in' | 'out'): CurveVector {
  return { x: point.x + point[side].x, y: point.y + point[side].y };
}

/**
 * Returns whether two curves are the same.
 *
 * @param left First curve.
 * @param right Second curve.
 * @returns True when every point, handle and segment matches.
 */
export function curveEquals(left: Curve, right: Curve): boolean {
  if (left.points.length !== right.points.length || left.segments.length !== right.segments.length) return false;
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= CURVE_EQUAL_EPSILON;
  const pointsEqual = left.points.every((point, index) => {
    const other = right.points[index];
    if (!other) return false;
    const values = [point.x, point.y, point.in.x, point.in.y, point.out.x, point.out.y];
    const others = [other.x, other.y, other.in.x, other.in.y, other.out.x, other.out.y];
    return values.every((value, at) => near(value, others[at] ?? Number.NaN));
  });
  const segmentsEqual = left.segments.every(
    (segment, index) =>
      segment.mode === right.segments[index]?.mode &&
      segment.detail === right.segments[index]?.detail &&
      segment.section === right.segments[index]?.section,
  );
  const markersEqual = left.markers?.bottom === right.markers?.bottom && left.markers?.top === right.markers?.top;
  return pointsEqual && segmentsEqual && markersEqual;
}
