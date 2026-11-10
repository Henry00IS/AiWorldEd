import { CURVE_SECTION_CHOICES } from './curve_section.js';
import { curveConstrain } from './curve_constrain.js';
import {
  curvePointCreate,
  type Curve,
  type CurveMarkerPlaces,
  type CurveLayer,
  type CurveMarkers,
  type CurveSegment,
  type CurveSegmentSide,
} from './curve_model.js';

/** Plain JSON form of a curve. */
export interface CurveData {
  /** Points as [x, y, inX, inY, outX, outY], left to right. */
  points: number[][];
  /**
   * Segments as [mode, detail, section, polygon sides, twist, corner size,
   * corner sides, rotation, cross arm width, stadium straight, side, fixed
   * depth, bar end thickness, blend], trailing defaults left out.
   */
  segments: [string, number, ...(string | number | null)[]][];
  /** Section markers, when the curve has any. */
  markers?: CurveMarkers;
  /** Secondary profile line of custom-sided segments, when the curve has one. */
  secondary?: { points: number[][]; segments: [string, number, ...(string | number | null)[]][] };
}

/** Stored letters of the side modes. */
const CURVE_CODEC_SIDES: Readonly<Record<CurveSegmentSide, string>> = { negative: 'n', positive: 'p', custom: 'c' };

/** Decimal places kept when a curve is written. */
const CURVE_CODEC_DECIMALS = 6;

/**
 * Rounds a number for storage.
 *
 * @param value Number.
 * @returns Rounded number, without negative zero.
 */
function curveCodecRound(value: number): number {
  const rounded = Number(value.toFixed(CURVE_CODEC_DECIMALS));
  return rounded === 0 ? 0 : rounded;
}

/**
 * Converts a curve to its plain JSON form.
 *
 * @param curve Curve.
 * @returns Plain data.
 */
export function curveToData(curve: Curve): CurveData {
  return {
    ...curveCodecLayer(curve),
    ...(curve.markers ? { markers: curveCodecMarkers(curve.markers) } : {}),
    ...(curve.secondary ? { secondary: curveCodecLayer(curve.secondary) } : {}),
  };
}

/**
 * Converts the points and segments of one profile line to plain data.
 *
 * @param layer Profile line.
 * @returns Stored points and segments.
 */
function curveCodecLayer(layer: CurveLayer): Pick<CurveData, 'points' | 'segments'> {
  return {
    points: layer.points.map((point) =>
      [point.x, point.y, point.in.x, point.in.y, point.out.x, point.out.y].map(curveCodecRound),
    ),
    segments: layer.segments.map(curveCodecSegment),
  };
}

/**
 * Rounds markers for storage, with the places of switched-off markers and the
 * fixed heights.
 *
 * @param markers Markers.
 * @returns Stored markers.
 */
function curveCodecMarkers(markers: CurveMarkers): CurveMarkers {
  const result: CurveMarkers = curveCodecPlaces(markers);
  if (markers.parked) result.parked = curveCodecPlaces(markers.parked);
  if (markers.heights) result.heights = curveCodecPlaces(markers.heights);
  return result;
}

/**
 * Rounds marker places for storage.
 *
 * @param places Places.
 * @returns Stored places.
 */
function curveCodecPlaces(places: CurveMarkerPlaces): CurveMarkerPlaces {
  const result: CurveMarkerPlaces = {};
  if (places.bottom !== undefined) result.bottom = curveCodecRound(places.bottom);
  if (places.top !== undefined) result.top = curveCodecRound(places.top);
  return result;
}

/**
 * Reads a curve from plain JSON, repairing anything out of range.
 *
 * @param data Unknown input.
 * @returns Valid curve, or null when the input is not a curve.
 */
export function curveFromData(data: unknown): Curve | null {
  const layer = curveCodecLayerRead(data);
  if (!layer) return null;
  const record = data as { markers?: unknown; secondary?: unknown };
  const markers = curveCodecMarkersRead(record.markers);
  const secondary = curveCodecLayerRead(record.secondary);
  return curveConstrain({ ...layer, ...(markers ? { markers } : {}), ...(secondary ? { secondary } : {}) });
}

/**
 * Reads the points and segments of one stored profile line.
 *
 * @param data Unknown input.
 * @returns Unconstrained line, or null when the input holds no line.
 */
function curveCodecLayerRead(data: unknown): CurveLayer | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as { points?: unknown; segments?: unknown };
  if (!Array.isArray(record.points) || record.points.length < 2) return null;
  const points = record.points.map((entry: unknown) => {
    const values = Array.isArray(entry) ? entry.map(Number) : [];
    const point = curvePointCreate(values[0] ?? 0, values[1] ?? 0);
    point.in = { x: values[2] || 0, y: values[3] || 0 };
    point.out = { x: values[4] || 0, y: values[5] || 0 };
    return point;
  });
  const segments = (Array.isArray(record.segments) ? record.segments : []).map(curveCodecSegmentRead);
  return { points, segments };
}

/**
 * Reads one compact segment tuple, including its optional section parameter,
 * twist and rotation.
 *
 * @param entry Stored tuple or invalid input.
 * @returns Unconstrained segment for the normal curve validation pass.
 */
function curveCodecSegmentRead(entry: unknown): CurveSegment {
  const values: unknown[] = Array.isArray(entry) ? entry : [];
  return {
    mode: String(values[0]),
    detail: Number(values[1]),
    section: curveCodecSectionRead(values[2]),
    polygonSides: Number(values[3] ?? 6),
    twist: Number(values[4] ?? 0),
    cornerSize: Number(values[5] ?? 0),
    cornerSides: Number(values[6] ?? 0),
    rotation: Number(values[7] ?? 0),
    armWidth: Number(values[8] ?? Number.NaN),
    straight: Number(values[9] ?? Number.NaN),
    side: (Object.keys(CURVE_CODEC_SIDES) as CurveSegmentSide[]).find((side) => CURVE_CODEC_SIDES[side] === values[10]),
    fixedDepth: values[11] === 1,
    armWidthEnd: typeof values[12] === 'number' ? values[12] : undefined,
    blend: values[13] === 1,
  } as CurveSegment;
}

/**
 * Reads a stored section type; 's' is the short form of square.
 *
 * @param value Stored section value.
 * @returns Section type, or undefined for round and unknown values.
 */
function curveCodecSectionRead(value: unknown): CurveSegment['section'] {
  if (value === 's') return 'square';
  const found = CURVE_SECTION_CHOICES.find((choice) => choice.value === value)?.value;
  return found === 'round' ? undefined : found;
}

/**
 * Reads stored markers, with the places of switched-off markers and the fixed
 * heights; anything else means none.
 *
 * @param value Stored value.
 * @returns Markers, or undefined.
 */
function curveCodecMarkersRead(value: unknown): CurveMarkers | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const result: CurveMarkers = curveCodecPlacesRead(value);
  const parked = (value as { parked?: unknown }).parked;
  if (parked && typeof parked === 'object') result.parked = curveCodecPlacesRead(parked);
  const heights = (value as { heights?: unknown }).heights;
  if (heights && typeof heights === 'object') result.heights = curveCodecPlacesRead(heights);
  return result;
}

/**
 * Reads stored marker places, keeping only numbers.
 *
 * @param value Stored object.
 * @returns Places.
 */
function curveCodecPlacesRead(value: object): CurveMarkerPlaces {
  const record = value as { bottom?: unknown; top?: unknown };
  const result: CurveMarkerPlaces = {};
  if (typeof record.bottom === 'number') result.bottom = record.bottom;
  if (typeof record.top === 'number') result.top = record.top;
  return result;
}

/**
 * Writes a curve as compact JSON text, the form modifiers store.
 *
 * @param curve Curve.
 * @returns JSON text.
 */
export function curveEncode(curve: Curve): string {
  return JSON.stringify(curveToData(curve));
}

/**
 * Reads compact JSON text written by {@link curveEncode}.
 *
 * @param text JSON text.
 * @returns Curve, or null for empty or invalid text.
 */
export function curveDecode(text: unknown): Curve | null {
  if (typeof text !== 'string' || text === '') return null;
  try {
    return curveFromData(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * Normalizes stored curve text: valid curves come back in canonical form,
 * anything else as empty text.
 *
 * @param text Stored value.
 * @returns Canonical JSON text, or empty.
 */
export function curveCanonical(text: unknown): string {
  const curve = curveDecode(text);
  return curve ? curveEncode(curve) : '';
}

/**
 * Stores a compact segment tuple without adding empty default fields.
 *
 * @param segment Curve segment.
 * @returns Mode, detail, then optional section, polygon sides, twist, corner
 *   size and faces, rotation, cross arm width, stadium straight, side mode,
 *   fixed depth, a bar's end thickness and the blend flag, trailing defaults
 *   left out; a bar end thickness keeps every field before it, so a sharp 0 is
 *   stored, and other segments hold its place with null.
 */
function curveCodecSegment(segment: CurveSegment): [string, number, ...(string | number | null)[]] {
  const section = segment.section;
  const tail: (string | number | null)[] = [
    section === 'square' ? 's' : (section ?? 'round'),
    section === 'polygon' ? (segment.polygonSides ?? 6) : 0,
    curveCodecRound(segment.twist ?? 0),
    curveCodecRound(segment.cornerSize ?? 0),
    segment.cornerSides ?? 0,
    curveCodecRound(segment.rotation ?? 0),
    section === 'cross' || section === 'bar' ? curveCodecRound(segment.armWidth ?? 0) : 0,
    section === 'stadium' ? curveCodecRound(segment.straight ?? 0) : 0,
    segment.side ? CURVE_CODEC_SIDES[segment.side] : 0,
    segment.fixedDepth ? 1 : 0,
    section === 'bar' && segment.armWidthEnd !== undefined ? curveCodecRound(segment.armWidthEnd) : null,
    segment.blend ? 1 : 0,
  ];
  while (tail.length > 0 && curveCodecTrailingDefault(tail, tail.length - 1)) tail.pop();
  return [segment.mode, segment.detail, ...tail];
}

/**
 * Place of a bar's end thickness among the section fields after mode and
 * detail.
 */
const CURVE_CODEC_BAR_END_INDEX = 10;

/**
 * Returns whether a stored tuple entry is a default that may be left off the
 * end: zero or round, or the empty end-thickness place, where 0 is a sharp edge
 * and stays.
 *
 * @param tail Section fields after mode and detail.
 * @param index Entry index.
 * @returns True when the entry can be dropped.
 */
function curveCodecTrailingDefault(tail: readonly (string | number | null)[], index: number): boolean {
  const value = tail[index];
  if (index === CURVE_CODEC_BAR_END_INDEX) return value === null;
  return value === 0 || value === 'round';
}
