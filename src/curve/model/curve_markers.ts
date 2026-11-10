import type { Curve, CurveMarkerPlaces, CurveMarkers } from './curve_model.js';

/** The two section markers. */
export type CurveMarkerSide = 'bottom' | 'top';

/** Smallest x gap kept between the markers and from the curve ends. */
export const CURVE_MARKER_GAP = 0.01;

/** Where a newly added marker starts. */
export const CURVE_MARKER_DEFAULT: Readonly<Record<CurveMarkerSide, number>> = { bottom: 0.2, top: 0.8 };

/**
 * Returns valid markers: inside the curve, apart from the ends and each other,
 * bottom below top. A top marker that cannot fit is dropped. Parked places are
 * kept, clamped inside the curve, only for markers that are switched off.
 *
 * @param markers Candidate markers.
 * @returns Valid markers, or undefined when none remain.
 */
export function curveMarkersConstrain(markers: CurveMarkers | undefined): CurveMarkers | undefined {
  if (!markers) return undefined;
  const result: CurveMarkers = curveMarkerPlacesClamp(markers);
  if (result.bottom !== undefined && result.top !== undefined && result.top - result.bottom < CURVE_MARKER_GAP) {
    result.top = result.bottom + CURVE_MARKER_GAP;
    if (result.top > 1 - CURVE_MARKER_GAP) delete result.top;
  }
  const parked = curveMarkerPlacesClamp(markers.parked ?? {});
  for (const side of ['bottom', 'top'] as const) if (result[side] !== undefined) delete parked[side];
  if (parked.bottom !== undefined || parked.top !== undefined) result.parked = parked;
  const heights = curveMarkerHeightsClamp(markers.heights ?? {});
  if (heights.bottom !== undefined || heights.top !== undefined) result.heights = heights;
  return result.bottom === undefined && result.top === undefined && !result.parked && !result.heights
    ? undefined
    : result;
}

/** Largest fixed base or top height in metres. */
export const CURVE_MARKER_HEIGHT_MAX = 100;

/**
 * Keeps the finite fixed heights, clamped to 0..CURVE_MARKER_HEIGHT_MAX metres.
 *
 * @param heights Candidate heights.
 * @returns Clamped heights.
 */
function curveMarkerHeightsClamp(heights: CurveMarkerPlaces): CurveMarkerPlaces {
  const clamp = (value: number) => Math.min(CURVE_MARKER_HEIGHT_MAX, Math.max(0, value));
  const result: CurveMarkerPlaces = {};
  if (Number.isFinite(heights.bottom)) result.bottom = clamp(Number(heights.bottom));
  if (Number.isFinite(heights.top)) result.top = clamp(Number(heights.top));
  return result;
}

/**
 * Sets the fixed height of the base or the top of a curve.
 *
 * @param curve Curve.
 * @param side Marker whose section height is set.
 * @param height Height in metres.
 * @returns New curve.
 */
export function curveMarkerHeightSet(curve: Curve, side: CurveMarkerSide, height: number): Curve {
  const markers: CurveMarkers = { ...curve.markers, heights: { ...curve.markers?.heights, [side]: height } };
  return curveMarkersReplace(curve, markers);
}

/**
 * Returns the fixed base and top heights of a curve, falling back to the
 * column's own heights for curves stored before curves carried them.
 *
 * @param curve Curve.
 * @param fallback Column heights.
 * @returns Base and top heights in metres.
 */
export function curveMarkerHeights(curve: Curve, fallback: CurveMarkerHeights): CurveMarkerHeights {
  const heights = curve.markers?.heights;
  return { base: heights?.bottom ?? fallback.base, top: heights?.top ?? fallback.top };
}

/**
 * Keeps the finite marker places, clamped inside the curve away from its ends.
 *
 * @param places Candidate places.
 * @returns Clamped places.
 */
function curveMarkerPlacesClamp(places: CurveMarkerPlaces): CurveMarkerPlaces {
  const clamp = (value: number) => Math.min(1 - CURVE_MARKER_GAP, Math.max(CURVE_MARKER_GAP, value));
  const result: CurveMarkerPlaces = {};
  if (Number.isFinite(places.bottom)) result.bottom = clamp(Number(places.bottom));
  if (Number.isFinite(places.top)) result.top = clamp(Number(places.top));
  return result;
}

/**
 * Moves one switched-on marker; a marker never passes the other.
 *
 * @param curve Curve.
 * @param side Marker.
 * @param x New position.
 * @returns New curve.
 */
export function curveMarkerSet(curve: Curve, side: CurveMarkerSide, x: number): Curve {
  const markers: CurveMarkers = { ...curve.markers };
  markers[side] = curveMarkerClampToOther(markers, side, x);
  return curveMarkersReplace(curve, markers);
}

/**
 * Switches one marker on at its remembered place (or the default place), or
 * off, remembering where it was.
 *
 * @param curve Curve.
 * @param side Marker.
 * @param on True to switch it on.
 * @returns New curve.
 */
export function curveMarkerSwitch(curve: Curve, side: CurveMarkerSide, on: boolean): Curve {
  const markers: CurveMarkers = { ...curve.markers };
  const parked: CurveMarkerPlaces = { ...curve.markers?.parked };
  const place = on ? (markers[side] ?? parked[side] ?? CURVE_MARKER_DEFAULT[side]) : markers[side];
  if (on) markers[side] = curveMarkerClampToOther(markers, side, place ?? CURVE_MARKER_DEFAULT[side]);
  else delete markers[side];
  if (on) delete parked[side];
  else if (place !== undefined) parked[side] = place;
  markers.parked = parked;
  return curveMarkersReplace(curve, markers);
}

/**
 * Returns a curve with new markers, validated.
 *
 * @param curve Curve.
 * @param markers Candidate markers.
 * @returns New curve.
 */
function curveMarkersReplace(curve: Curve, markers: CurveMarkers): Curve {
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
 * Mirrors markers left to right: the bottom becomes the top, for switched-on
 * and parked markers and their fixed heights alike.
 *
 * @param markers Markers.
 * @returns Mirrored markers.
 */
export function curveMarkersMirror(markers: CurveMarkers | undefined): CurveMarkers | undefined {
  if (!markers) return undefined;
  const result: CurveMarkers = curveMarkerPlacesMirror(markers);
  if (markers.parked) result.parked = curveMarkerPlacesMirror(markers.parked);
  if (markers.heights) result.heights = curveMarkerHeightsSwap(markers.heights);
  return result;
}

/**
 * Swaps the base and top heights.
 *
 * @param heights Heights.
 * @returns Swapped heights.
 */
function curveMarkerHeightsSwap(heights: CurveMarkerPlaces): CurveMarkerPlaces {
  const result: CurveMarkerPlaces = {};
  if (heights.top !== undefined) result.bottom = heights.top;
  if (heights.bottom !== undefined) result.top = heights.bottom;
  return result;
}

/**
 * Mirrors marker places left to right.
 *
 * @param places Places.
 * @returns Mirrored places.
 */
function curveMarkerPlacesMirror(places: CurveMarkerPlaces): CurveMarkerPlaces {
  const result: CurveMarkerPlaces = {};
  if (places.top !== undefined) result.bottom = 1 - places.top;
  if (places.bottom !== undefined) result.top = 1 - places.bottom;
  return result;
}
