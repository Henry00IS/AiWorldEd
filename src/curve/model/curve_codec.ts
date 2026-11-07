import { curveConstrain } from './curve_constrain.js';
import { curvePointCreate, type Curve, type CurveMarkers, type CurveSegment } from './curve_model.js';

/** Plain JSON form of a curve. */
export interface CurveData {
  /** Points as [x, y, inX, inY, outX, outY], left to right. */
  points: number[][];
  /** Segments as [mode, detail], with a third entry 's' for a square section. */
  segments: ([string, number] | [string, number, 's'])[];
  /** Section markers, when the curve has any. */
  markers?: CurveMarkers;
}

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
    points: curve.points.map((point) =>
      [point.x, point.y, point.in.x, point.in.y, point.out.x, point.out.y].map(curveCodecRound),
    ),
    segments: curve.segments.map((segment) =>
      segment.section === 'square' ? [segment.mode, segment.detail, 's'] : [segment.mode, segment.detail],
    ),
    ...(curve.markers ? { markers: curveCodecMarkers(curve.markers) } : {}),
  };
}

/**
 * Rounds markers for storage.
 *
 * @param markers Markers.
 * @returns Stored markers.
 */
function curveCodecMarkers(markers: CurveMarkers): CurveMarkers {
  const result: CurveMarkers = {};
  if (markers.bottom !== undefined) result.bottom = curveCodecRound(markers.bottom);
  if (markers.top !== undefined) result.top = curveCodecRound(markers.top);
  return result;
}

/**
 * Reads a curve from plain JSON, repairing anything out of range.
 *
 * @param data Unknown input.
 * @returns Valid curve, or null when the input is not a curve.
 */
export function curveFromData(data: unknown): Curve | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as { points?: unknown; segments?: unknown; markers?: unknown };
  if (!Array.isArray(record.points) || record.points.length < 2) return null;
  const points = record.points.map((entry: unknown) => {
    const values = Array.isArray(entry) ? entry.map(Number) : [];
    const point = curvePointCreate(values[0] ?? 0, values[1] ?? 0);
    point.in = { x: values[2] || 0, y: values[3] || 0 };
    point.out = { x: values[4] || 0, y: values[5] || 0 };
    return point;
  });
  const segments = (Array.isArray(record.segments) ? record.segments : []).map((entry: unknown) => {
    const values: unknown[] = Array.isArray(entry) ? entry : [];
    const square = values[2] === 's' ? { section: 'square' as const } : {};
    return { mode: String(values[0]), detail: Number(values[1]), ...square } as CurveSegment;
  });
  const markers = curveCodecMarkersRead(record.markers);
  return curveConstrain({ points, segments, ...(markers ? { markers } : {}) });
}

/**
 * Reads stored markers; anything else means none.
 *
 * @param value Stored value.
 * @returns Markers, or undefined.
 */
function curveCodecMarkersRead(value: unknown): CurveMarkers | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as { bottom?: unknown; top?: unknown };
  const result: CurveMarkers = {};
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
