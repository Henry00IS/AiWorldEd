/** A point of a sketch, in meters on the sketch plane. */
export interface SketchPoint {
  u: number;
  v: number;
}

/** Axis-aligned rectangle given by its centre and size. */
export interface SketchRectangle {
  type: 'rectangle';
  u: number;
  v: number;
  width: number;
  height: number;
}

/** Circle given by its centre and radius, drawn with a number of sides. */
export interface SketchCircle {
  type: 'circle';
  u: number;
  v: number;
  radius: number;
  sides: number;
}

/**
 * Arc band: a curved strip of a given thickness centred on the arc, from a
 * start angle over a sweep, both in degrees counter-clockwise from +U.
 */
export interface SketchArc {
  type: 'arc';
  u: number;
  v: number;
  radius: number;
  start: number;
  sweep: number;
  thickness: number;
  sides: number;
}

/** Closed outline through its points; may be concave. */
export interface SketchPolygon {
  type: 'polygon';
  points: SketchPoint[];
}

/** Open line through its points, drawn as a strip of a given thickness. */
export interface SketchPolyline {
  type: 'polyline';
  points: SketchPoint[];
  thickness: number;
}

/** One drawn shape. */
export type SketchShape = SketchRectangle | SketchCircle | SketchArc | SketchPolygon | SketchPolyline;

/** Every shape type, in menu order. */
export const SKETCH_SHAPE_TYPES: readonly SketchShape['type'][] = ['rectangle', 'circle', 'arc', 'polygon', 'polyline'];

/**
 * A 2D sketch: shapes drawn on a plane. It stays a plain value stored by the
 * object that builds from it, so editing the sketch rebuilds the result and
 * copying the object copies the sketch.
 */
export interface Sketch {
  shapes: SketchShape[];
}

/** Most shapes one sketch keeps. */
export const SKETCH_MAX_SHAPES = 32;
/** Most points one polygon or polyline keeps. */
export const SKETCH_MAX_POINTS = 64;
/** Most sides of a circle or arc. */
export const SKETCH_MAX_SIDES = 64;
/** Largest coordinate or size, in meters. */
const SKETCH_LIMIT = 10000;

/**
 * Clamps a number, falling back for anything that is not finite.
 *
 * @param value Candidate.
 * @param fallback Fallback.
 * @param min Minimum.
 * @param max Maximum.
 * @returns Number.
 */
function sketchNumber(value: unknown, fallback: number, min = -SKETCH_LIMIT, max = SKETCH_LIMIT): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, numeric));
}

/**
 * Normalizes a point list.
 *
 * @param input Candidate list.
 * @returns Finite points, at most {@link SKETCH_MAX_POINTS}.
 */
function sketchPoints(input: unknown): SketchPoint[] {
  const raw = Array.isArray(input) ? input : [];
  const points: SketchPoint[] = [];
  for (const candidate of raw.slice(0, SKETCH_MAX_POINTS)) {
    const record = (typeof candidate === 'object' && candidate !== null ? candidate : {}) as Record<string, unknown>;
    if (typeof record['u'] !== 'number' || typeof record['v'] !== 'number') continue;
    if (!Number.isFinite(record['u']) || !Number.isFinite(record['v'])) continue;
    points.push({ u: sketchNumber(record['u'], 0), v: sketchNumber(record['v'], 0) });
  }
  return points;
}

/**
 * Normalizes one shape.
 *
 * @param input Candidate shape.
 * @returns Valid shape, or null for an unknown or unusable one.
 */
export function sketchShapeNormalize(input: unknown): SketchShape | null {
  const s = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const u = sketchNumber(s['u'], 0);
  const v = sketchNumber(s['v'], 0);
  const sides = Math.round(sketchNumber(s['sides'], 24, 3, SKETCH_MAX_SIDES));
  switch (s['type']) {
    case 'rectangle':
      return {
        type: 'rectangle',
        u,
        v,
        width: sketchNumber(s['width'], 1, 0.001),
        height: sketchNumber(s['height'], 1, 0.001),
      };
    case 'circle':
      return { type: 'circle', u, v, radius: sketchNumber(s['radius'], 0.5, 0.001), sides };
    case 'arc':
      return {
        type: 'arc',
        u,
        v,
        radius: sketchNumber(s['radius'], 2, 0.001),
        start: sketchNumber(s['start'], 0, -360, 360),
        sweep: sketchNumber(s['sweep'], 90, -360, 360),
        thickness: sketchNumber(s['thickness'], 0.25, 0.001),
        sides,
      };
    case 'polygon': {
      const points = sketchPoints(s['points']);
      return points.length >= 3 ? { type: 'polygon', points } : null;
    }
    case 'polyline': {
      const points = sketchPoints(s['points']);
      return points.length >= 2
        ? { type: 'polyline', points, thickness: sketchNumber(s['thickness'], 0.25, 0.001) }
        : null;
    }
    default:
      return null;
  }
}

/**
 * Normalizes untrusted sketch data.
 *
 * @param input Candidate sketch.
 * @returns Valid sketch; may hold no shapes.
 */
export function sketchNormalize(input: unknown): Sketch {
  const record = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const raw = Array.isArray(record['shapes']) ? record['shapes'] : [];
  const shapes: SketchShape[] = [];
  for (const candidate of raw.slice(0, SKETCH_MAX_SHAPES)) {
    const shape = sketchShapeNormalize(candidate);
    if (shape) shapes.push(shape);
  }
  return { shapes };
}

/**
 * Returns a new shape of a type with starting values, centred on the plane.
 *
 * @param type Shape type.
 * @returns Shape.
 */
export function sketchShapeCreate(type: SketchShape['type']): SketchShape {
  switch (type) {
    case 'rectangle':
      return { type, u: 0, v: 0, width: 1, height: 1 };
    case 'circle':
      return { type, u: 0, v: 0, radius: 0.5, sides: 24 };
    case 'arc':
      return { type, u: 0, v: 0, radius: 1.5, start: 0, sweep: 180, thickness: 0.25, sides: 16 };
    case 'polygon':
      return {
        type,
        points: [
          { u: -1, v: -1 },
          { u: 1, v: -1 },
          { u: 1, v: 0 },
          { u: 0, v: 0 },
          { u: 0, v: 1 },
          { u: -1, v: 1 },
        ],
      };
    case 'polyline':
      return {
        type,
        points: [
          { u: -1, v: 0 },
          { u: 0, v: 0 },
          { u: 0, v: 1 },
        ],
        thickness: 0.25,
      };
  }
}

/**
 * Encodes a sketch as compact text for a parameter, a file or the network.
 *
 * @param sketch Sketch.
 * @returns Encoded sketch.
 */
export function sketchEncode(sketch: Sketch): string {
  const round = (value: number): number => Math.round(value * 1e5) / 1e5 || 0;
  const shapes = sketch.shapes.map((shape) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(shape)) {
      if (typeof value === 'number') out[key] = round(value);
      else if (Array.isArray(value))
        out[key] = value.map((point: SketchPoint) => ({ u: round(point.u), v: round(point.v) }));
      else out[key] = value;
    }
    return out;
  });
  return JSON.stringify({ shapes });
}

/**
 * Decodes an encoded sketch.
 *
 * @param text Encoded sketch.
 * @returns Normalized sketch, or null when the text is no sketch.
 */
export function sketchDecode(text: unknown): Sketch | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > 262144) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { shapes?: unknown }).shapes))
      return null;
    return sketchNormalize(parsed);
  } catch {
    return null;
  }
}

/**
 * Returns the canonical encoding of a stored value.
 *
 * @param value Stored value.
 * @param fallback Encoded sketch used when the value is no sketch.
 * @returns Encoded sketch.
 */
export function sketchCanonical(value: unknown, fallback: unknown): string {
  return sketchEncode(sketchDecode(value) ?? sketchDecode(fallback) ?? { shapes: [] });
}
