import { curveEncode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline, type Curve } from '@/curve/model/curve_model.js';
import type { CurvePreset } from '@/curve/model/curve_preset.js';
import { CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';
import { curvePresetCatalog } from '@/curve/model/curve_preset_catalog.js';
import { CURVE_PRESETS_EXTENDED } from '@/curve/model/curve_preset_extended.js';
import { CURVE_PRESETS_TURNERY } from '@/curve/model/curve_preset_turnery.js';
import { curveEvaluate } from '@/curve/model/curve_sample.js';
import { solidScriptPolygonArea, type SolidScriptPoint2 } from './solid_script_polygon.js';

/**
 * Side modes of a Curve Profile: one-sided outward, one-sided inward, or
 * symmetric on both sides.
 */
export const SOLID_SCRIPT_CURVE_PROFILE_SIDES = ['Normal', 'Flipped', 'Mirrored'] as const;

/** Side mode of a Curve Profile. */
export type SolidScriptCurveProfileSide = (typeof SOLID_SCRIPT_CURVE_PROFILE_SIDES)[number];

/** Maximum straight segments along a Curve Profile's height. */
export const SOLID_SCRIPT_CURVE_PROFILE_MAX_SEGMENTS = 256;

/** Tolerance below which adjacent profile points count as the same corner. */
const SOLID_SCRIPT_CURVE_PROFILE_EPSILON = 1e-9;

/** Architectural and turned curve presets offered by Curve Profile pickers. */
export const SOLID_SCRIPT_CURVE_PROFILE_PRESETS: readonly CurvePreset[] = curvePresetCatalog([
  ...CURVE_PRESETS_ARCHITECTURE,
  ...CURVE_PRESETS_TURNERY,
  ...CURVE_PRESETS_EXTENDED,
]);

/**
 * Encoded flat 1.0 fallback curve shown when a Curve Profile field is still
 * empty.
 */
export const SOLID_SCRIPT_CURVE_PROFILE_FALLBACK = curveEncode(
  curveFromPolyline([
    [0, 1],
    [1, 1],
  ]),
);

/**
 * Parses a Curve Profile side mode word, ignoring case.
 *
 * @param text Typed side word.
 * @param usage Command or function name for error messages.
 * @returns Canonical Title Case side mode.
 */
export function solidScriptCurveProfileSideRead(text: string, usage: string): SolidScriptCurveProfileSide {
  const trimmed = text.trim();
  const match = SOLID_SCRIPT_CURVE_PROFILE_SIDES.find((word) => word.toLowerCase() === trimmed.toLowerCase());
  if (!match) throw new Error(`${usage} side needs ${SOLID_SCRIPT_CURVE_PROFILE_SIDES.join(', ')}, not "${trimmed}"`);
  return match;
}

/**
 * Samples a curve from t = 0 to t = 1 across uniform steps, preserving any
 * vertical steps where two adjacent curve points share the same x.
 *
 * @param curve Curve to evaluate.
 * @param segments Number of uniform height segments.
 * @returns Samples ordered from bottom (t = 0) to top (t = 1).
 */
function solidScriptCurveProfileSamples(curve: Curve, segments: number): Array<{ t: number; y: number }> {
  const stepKeys = new Set<number>();
  const steps: Array<{ t: number; y: number }> = [];
  for (let index = 0; index < curve.points.length - 1; index++) {
    const start = curve.points[index]!;
    const end = curve.points[index + 1]!;
    if (
      Math.abs(start.x - end.x) <= SOLID_SCRIPT_CURVE_PROFILE_EPSILON &&
      Math.abs(start.y - end.y) > SOLID_SCRIPT_CURVE_PROFILE_EPSILON
    ) {
      stepKeys.add(Math.round(start.x * 1e9));
      steps.push({ t: start.x, y: start.y }, { t: end.x, y: end.y });
    }
  }
  const uniform: Array<{ t: number; y: number }> = [];
  for (let step = 0; step <= segments; step++) {
    const t = step / segments;
    if (!stepKeys.has(Math.round(t * 1e9))) uniform.push({ t, y: curveEvaluate(curve, t) });
  }
  return [...uniform, ...steps].sort((left, right) => left.t - right.t);
}

/**
 * Removes duplicate consecutive points and a closing point matching the first.
 *
 * @param points Candidate 2D polygon corners.
 * @returns Cleaned 2D polygon corners.
 */
function solidScriptCurveProfileCompact(points: readonly SolidScriptPoint2[]): SolidScriptPoint2[] {
  const out: SolidScriptPoint2[] = [];
  for (const [x, y] of points) {
    const prev = out[out.length - 1];
    if (
      prev &&
      Math.abs(prev[0] - x) <= SOLID_SCRIPT_CURVE_PROFILE_EPSILON &&
      Math.abs(prev[1] - y) <= SOLID_SCRIPT_CURVE_PROFILE_EPSILON
    )
      continue;
    out.push([x, y]);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (
    first &&
    last &&
    out.length > 1 &&
    Math.abs(first[0] - last[0]) <= SOLID_SCRIPT_CURVE_PROFILE_EPSILON &&
    Math.abs(first[1] - last[1]) <= SOLID_SCRIPT_CURVE_PROFILE_EPSILON
  )
    out.pop();
  return out;
}

/**
 * Builds a closed 2D XY profile by rotating a curve -90 degrees along a
 * vertical segment: curve left (t = 0) sits at y = 0, curve right (t = 1) at y
 * = height, and curve value scales outward horizontal offset by depth.
 *
 * @param curve Profile curve.
 * @param height Vertical profile height in metres (greater than 0).
 * @param depth Horizontal depth at curve value 1 in metres (greater than 0).
 * @param side Normal (+X), Flipped (-X), or Mirrored (symmetric +/-X).
 * @param segments Straight steps along the height (1..256).
 * @param usage Command or function name for error messages.
 * @returns Closed counter-clockwise 2D XY corners.
 */
export function solidScriptCurveProfilePoints(
  curve: Curve,
  height: number,
  depth: number,
  side: SolidScriptCurveProfileSide,
  segments: number,
  usage = 'Curve Profile',
): SolidScriptPoint2[] {
  if (!(height > 0)) throw new Error(`${usage} height must be greater than 0, not ${height}`);
  if (!(depth > 0)) throw new Error(`${usage} depth must be greater than 0, not ${depth}`);
  if (!Number.isInteger(segments) || segments < 1 || segments > SOLID_SCRIPT_CURVE_PROFILE_MAX_SEGMENTS)
    throw new Error(
      `${usage} segments must be a whole number from 1 to ${SOLID_SCRIPT_CURVE_PROFILE_MAX_SEGMENTS}, not ${segments}`,
    );
  const samples = solidScriptCurveProfileSamples(curve, segments).map(({ t, y }): SolidScriptPoint2 => [
    y * depth,
    t * height,
  ]);
  const reversed = [...samples].reverse();
  const raw: SolidScriptPoint2[] =
    side === 'Normal'
      ? [[0, 0], ...samples, [0, height]]
      : side === 'Flipped'
        ? [[0, height], ...reversed.map(([x, y]): SolidScriptPoint2 => [-x, y]), [0, 0]]
        : [...samples, ...reversed.map(([x, y]): SolidScriptPoint2 => [-x, y])];
  const points = solidScriptCurveProfileCompact(raw);
  if (points.length < 3 || Math.abs(solidScriptPolygonArea(points)) <= 1e-12)
    throw new Error(`${usage} needs a curve above 0 so it encloses an area`);
  return solidScriptPolygonArea(points) < 0 ? points.reverse() : points;
}
