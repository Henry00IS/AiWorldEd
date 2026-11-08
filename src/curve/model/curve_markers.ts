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
  return result.bottom === undefined && result.top === undefined && !result.parked ? undefined : result;
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
 * Switches each marker of a curve on or off to match another curve, keeping the
 * curve's own marker places, such as a preset picked while some markers are
 * on.
 *
 * @param curve Curve whose places are used.
 * @param model Curve whose on and off states are copied.
 * @returns New curve.
 */
export function curveMarkersFollow(curve: Curve, model: Curve): Curve {
  return (['bottom', 'top'] as const).reduce(
    (result, side) => curveMarkerSwitch(result, side, model.markers?.[side] !== undefined),
    curve,
  );
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
 * and parked markers alike.
 *
 * @param markers Markers.
 * @returns Mirrored markers.
 */
export function curveMarkersMirror(markers: CurveMarkers | undefined): CurveMarkers | undefined {
  if (!markers) return undefined;
  const result: CurveMarkers = curveMarkerPlacesMirror(markers);
  if (markers.parked) result.parked = curveMarkerPlacesMirror(markers.parked);
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
