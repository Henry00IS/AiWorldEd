import type { Curve, CurveMarkers } from './curve_model.js';

/** The two section markers. */
export type CurveMarkerSide = 'bottom' | 'top';

/** Smallest x gap kept between the markers and from the curve ends. */
export const CURVE_MARKER_GAP = 0.01;

/** Where a newly added marker starts. */
export const CURVE_MARKER_DEFAULT: Readonly<Record<CurveMarkerSide, number>> = { bottom: 0.2, top: 0.8 };

/**
 * Returns valid markers: inside the curve, apart from the ends and each other,
 * bottom below top. A top marker that cannot fit is dropped.
 *
 * @param markers Candidate markers.
 * @returns Valid markers, or undefined when none remain.
 */
export function curveMarkersConstrain(markers: CurveMarkers | undefined): CurveMarkers | undefined {
  if (!markers) return undefined;
  const clamp = (value: number) => Math.min(1 - CURVE_MARKER_GAP, Math.max(CURVE_MARKER_GAP, value));
  const result: CurveMarkers = {};
  if (Number.isFinite(markers.bottom)) result.bottom = clamp(Number(markers.bottom));
  if (Number.isFinite(markers.top)) result.top = clamp(Number(markers.top));
  if (result.bottom !== undefined && result.top !== undefined && result.top - result.bottom < CURVE_MARKER_GAP) {
    result.top = result.bottom + CURVE_MARKER_GAP;
    if (result.top > 1 - CURVE_MARKER_GAP) delete result.top;
  }
  return result.bottom === undefined && result.top === undefined ? undefined : result;
}

/**
 * Adds, moves or removes one marker; a marker never passes the other.
 *
 * @param curve Curve.
 * @param side Marker.
 * @param x New position, or null to remove it.
 * @returns New curve.
 */
export function curveMarkerSet(curve: Curve, side: CurveMarkerSide, x: number | null): Curve {
  const markers: CurveMarkers = { ...curve.markers };
  if (x === null) delete markers[side];
  else markers[side] = curveMarkerClampToOther(markers, side, x);
  const next = curveMarkersConstrain(markers);
  const { markers: _old, ...rest } = curve;
  return next ? { ...rest, markers: next } : rest;
}

/**
 * Keeps a moved marker on its side of the other marker.
 *
 * @param markers Current markers.
 * @param side Moved marker.
 * @param x Wanted position.
 * @returns Allowed position.
 */
function curveMarkerClampToOther(markers: CurveMarkers, side: CurveMarkerSide, x: number): number {
  if (side === 'bottom' && markers.top !== undefined) return Math.min(x, markers.top - CURVE_MARKER_GAP);
  if (side === 'top' && markers.bottom !== undefined) return Math.max(x, markers.bottom + CURVE_MARKER_GAP);
  return x;
}

/** Fixed heights of the base and top sections in world units. */
export interface CurveMarkerHeights {
  base: number;
  top: number;
}

/**
 * Builds the map from curve x to height along a column: the part below the
 * bottom marker keeps the base height, the part above the top marker keeps the
 * top height, and the middle stretches over what remains. When the column is
 * shorter than base plus top both shrink in proportion and the middle vanishes.
 * Without markers x maps straight onto the height.
 *
 * @param markers Curve markers.
 * @param height Total height.
 * @param fixed Base and top heights.
 * @returns Map from x to height.
 */
export function curveMarkersHeightMap(
  markers: CurveMarkers | undefined,
  height: number,
  fixed: CurveMarkerHeights,
): (x: number) => number {
  const bottom = markers?.bottom ?? 0;
  const top = markers?.top ?? 1;
  let base = markers?.bottom !== undefined ? Math.max(0, fixed.base) : 0;
  let cap = markers?.top !== undefined ? Math.max(0, fixed.top) : 0;
  if (base + cap > height) {
    const scale = base + cap > 0 ? height / (base + cap) : 0;
    base *= scale;
    cap *= scale;
  }
  const middle = height - base - cap;
  return (x) => {
    if (x <= bottom) return bottom > 0 ? (x / bottom) * base : 0;
    if (x >= top) return base + middle + (top < 1 ? ((x - top) / (1 - top)) * cap : 0);
    return base + ((x - bottom) / (top - bottom)) * middle;
  };
}

/**
 * Mirrors markers left to right: the bottom becomes the top.
 *
 * @param markers Markers.
 * @returns Mirrored markers.
 */
export function curveMarkersMirror(markers: CurveMarkers | undefined): CurveMarkers | undefined {
  if (!markers) return undefined;
  const result: CurveMarkers = {};
  if (markers.top !== undefined) result.bottom = 1 - markers.top;
  if (markers.bottom !== undefined) result.top = 1 - markers.bottom;
  return result;
}
