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
 * count, square is a four-sided block, polygon a regular one and cross a plus
 * made of two crossed bars, bar a single flat bar like a blade, and stadium a
 * slot with flat sides and round ends. Square and polygon corners can be cut or
 * rounded.
 */
export type CurveSegmentSection = 'round' | 'square' | 'polygon' | 'cross' | 'bar' | 'stadium';

/**
 * Which side of a flat section follows the profile: absent mirrors both sides,
 * negative grows only the -X side, positive only the +X side, and custom shapes
 * the -X side with the curve's secondary profile.
 */
export type CurveSegmentSide = 'negative' | 'positive' | 'custom';

/** One segment between two neighbouring points. */
export interface CurveSegment {
  /** Bend mode. */
  mode: CurveSegmentMode;
  /** Straight pieces a bent segment is split into. */
  detail: number;
  /** Cross-section; absent means round. */
  section?: Exclude<CurveSegmentSection, 'round'>;
  /**
   * Corner size as a fraction of half a side: 0 keeps sharp corners, 1 meets at
   * the side middles.
   */
  cornerSize?: number;
  /** Faces across each corner: 1 is a straight chamfer, more round it. */
  cornerSides?: number;
  /** Number of flat polygon faces. */
  polygonSides?: number;
  /**
   * Thickness of each cross arm, or of a bar, as a fraction of the section
   * width.
   */
  armWidth?: number;
  /**
   * Thickness of a bar at the segment's upper end, as a fraction of the section
   * width; the thickness changes linearly along the segment, down to 0 for a
   * sharp edge. Absent keeps `armWidth` all the way.
   */
  armWidthEnd?: number;
  /** Length of a stadium's flat sides as a fraction of the section width. */
  straight?: number;
  /**
   * Side mode of a bar, square or stadium segment; absent mirrors the profile
   * on both sides.
   */
  side?: CurveSegmentSide;
  /**
   * True keeps a square or stadium segment's depth fixed while its width
   * follows the profile, so its front and back stay flat.
   */
  fixedDepth?: boolean;
  /** Twist in degrees over this segment, added to preceding segments. */
  twist?: number;
  /**
   * Rigid turn of this whole segment in degrees, added on top of the twist
   * accumulated below it; it does not carry over to later segments.
   */
  rotation?: number;
  /**
   * True lets this segment morph from a neighbour whose cross-section differs
   * at a shared point into its own, as the convex hull of the two rings,
   * instead of stepping there. Absent keeps the step.
   */
  blend?: boolean;
}

/** Places of the two section markers on the x axis. */
export interface CurveMarkerPlaces {
  /** Bottom marker x in 0..1. */
  bottom?: number;
  /** Top marker x in 0..1. */
  top?: number;
}

/**
 * Section markers on a curve's x axis, like loop points: below the bottom
 * marker is a fixed-height base, above the top marker a fixed-height top, and
 * the middle stretches. Either may be absent. A switched-off marker keeps its
 * place in `parked`, so switching it on again restores it.
 */
export interface CurveMarkers extends CurveMarkerPlaces {
  /** Remembered places of switched-off markers. */
  parked?: CurveMarkerPlaces;
  /**
   * Fixed heights in metres of the base below the bottom marker and the top
   * above the top marker, kept while a marker is off. Curves without them use
   * the column's own fixed heights.
   */
  heights?: CurveMarkerPlaces;
}

/**
 * Points and segments of one profile line: a function from left to right on the
 * unit square whose points never pass each other, the first at x 0 and the last
 * at x 1. Segment i joins point i and point i + 1.
 */
export interface CurveLayer {
  /** Points from left to right. */
  points: CurvePoint[];
  /** Segments, one fewer than points. */
  segments: CurveSegment[];
}

/**
 * A profile curve: its main line, optional section markers and an optional
 * secondary line that shapes the -X side of custom-sided segments.
 */
export interface Curve extends CurveLayer {
  /** Optional section markers on the x axis. */
  markers?: CurveMarkers;
  /**
   * Secondary profile line for segments whose side mode is custom; its segments
   * carry no sections.
   */
  secondary?: CurveLayer;
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
    ...curveLayerClone(curve),
    ...(curve.markers ? { markers: curveMarkersClone(curve.markers) } : {}),
    ...(curve.secondary ? { secondary: curveLayerClone(curve.secondary) } : {}),
  };
}

/**
 * Deep-copies the points and segments of one profile line.
 *
 * @param layer Profile line.
 * @returns Independent copy.
 */
export function curveLayerClone(layer: CurveLayer): CurveLayer {
  return {
    points: layer.points.map((point) => ({ x: point.x, y: point.y, in: { ...point.in }, out: { ...point.out } })),
    segments: layer.segments.map((segment) => ({ ...segment })),
  };
}

/**
 * Deep-copies markers, including the parked places.
 *
 * @param markers Markers.
 * @returns Independent copy.
 */
function curveMarkersClone(markers: CurveMarkers): CurveMarkers {
  const { parked, heights, ...places } = markers;
  return { ...places, ...(parked ? { parked: { ...parked } } : {}), ...(heights ? { heights: { ...heights } } : {}) };
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

/** Stored segment properties compared by curve equality. */
const CURVE_SEGMENT_PROPERTIES: readonly (keyof CurveSegment)[] = [
  'mode',
  'detail',
  'section',
  'cornerSize',
  'cornerSides',
  'polygonSides',
  'armWidth',
  'armWidthEnd',
  'straight',
  'side',
  'fixedDepth',
  'twist',
  'rotation',
  'blend',
];

/**
 * Returns whether two curves are the same.
 *
 * @param left First curve.
 * @param right Second curve.
 * @returns True when every point, handle and segment matches.
 */
export function curveEquals(left: Curve, right: Curve): boolean {
  const markersEqual =
    curveMarkerPlacesEqual(left.markers, right.markers) &&
    curveMarkerPlacesEqual(left.markers?.parked, right.markers?.parked) &&
    curveMarkerPlacesEqual(left.markers?.heights, right.markers?.heights);
  const secondaryEqual =
    !left.secondary || !right.secondary
      ? !left.secondary === !right.secondary
      : curveLayerEquals(left.secondary, right.secondary);
  return markersEqual && secondaryEqual && curveLayerEquals(left, right);
}

/**
 * Returns whether two profile lines have the same points, handles and segments.
 *
 * @param left First line.
 * @param right Second line.
 * @returns True when they match within the stored precision.
 */
function curveLayerEquals(left: CurveLayer, right: CurveLayer): boolean {
  if (left.points.length !== right.points.length || left.segments.length !== right.segments.length) return false;
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= CURVE_EQUAL_EPSILON;
  const pointsEqual = left.points.every((point, index) => {
    const other = right.points[index];
    if (!other) return false;
    const values = [point.x, point.y, point.in.x, point.in.y, point.out.x, point.out.y];
    const others = [other.x, other.y, other.in.x, other.in.y, other.out.x, other.out.y];
    return values.every((value, at) => near(value, others[at] ?? Number.NaN));
  });

  const segmentsEqual = left.segments.every((segment, index) =>
    CURVE_SEGMENT_PROPERTIES.every((field) => segment[field] === right.segments[index]?.[field]),
  );
  return pointsEqual && segmentsEqual;
}

/**
 * Returns whether two sets of marker places match.
 *
 * @param left First places.
 * @param right Second places.
 * @returns True when both markers sit at the same x or are both absent.
 */
function curveMarkerPlacesEqual(left: CurveMarkerPlaces | undefined, right: CurveMarkerPlaces | undefined): boolean {
  return left?.bottom === right?.bottom && left?.top === right?.top;
}
