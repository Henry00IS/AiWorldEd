import { CURVE_SECTION_CHOICES } from './curve_section.js';
import { curveConstrain } from './curve_constrain.js';
import { curvePointCreate, type Curve, type CurveMarkers, type CurveSegment } from './curve_model.js';

/** Plain JSON form of a curve. */
export interface CurveData {
  /** Points as [x, y, inX, inY, outX, outY], left to right. */
  points: number[][];
  /** Segments as [mode, detail, optional section, optional fillet fraction]. */
  segments: [string, number, ...(string | number)[]][];
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
    segments: curve.segments.map(curveCodecSegment),
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
  const segments = (Array.isArray(record.segments) ? record.segments : []).map(curveCodecSegmentRead);
  const markers = curveCodecMarkersRead(record.markers);
  return curveConstrain({ points, segments, ...(markers ? { markers } : {}) });
}

/**
 * Reads one compact segment tuple, including its optional section parameter and
 * twist.
 *
 * @param entry Stored tuple or invalid input.
 * @returns Unconstrained segment for the normal curve validation pass.
 */
function curveCodecSegmentRead(entry: unknown): CurveSegment {
  const values: unknown[] = Array.isArray(entry) ? entry : [];
  const section =
    values[2] === 's'
      ? 'square'
      : CURVE_SECTION_CHOICES.find((choice) => choice.value !== 'round' && choice.value === values[2])?.value;
  return {
    mode: String(values[0]),
    detail: Number(values[1]),
    section,
    cornerRadius: Number(values[3] ?? 0.25),
    chamferAmount: Number(values[3] ?? 0.3),
    polygonSides: Number(values[3] ?? 6),
    twist: Number(values[4] ?? 0),
  } as CurveSegment;
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

/**
 * Stores a compact segment tuple without adding empty default fields.
 *
 * @param segment Curve segment.
 * @returns Mode, detail, optional section parameter and twist.
 */
function curveCodecSegment(segment: CurveSegment): [string, number, ...(string | number)[]] {
  const result: [string, number, ...(string | number)[]] = [segment.mode, segment.detail];
  const section = segment.section;
  if (!section && !segment.twist) return result;
  result.push(section === 'square' ? 's' : (section ?? 'round'));
  const parameter =
    section === 'rounded_square'
      ? (segment.cornerRadius ?? 0.25)
      : section === 'chamfered_square'
        ? (segment.chamferAmount ?? 0.3)
        : section === 'polygon'
          ? (segment.polygonSides ?? 6)
          : 0;
  if (section !== 'square' || segment.twist) result.push(curveCodecRound(parameter));
  if (segment.twist) result.push(curveCodecRound(segment.twist));
  return result;
}
