import type { Curve, CurveVector } from '@/curve/model/curve_model.js';
import { curveMarkersHeightMap, type CurveMarkerHeights } from '@/curve/model/curve_markers.js';
import { curveSegmentSample } from '@/curve/model/curve_sample.js';
import type { GeneratorRevolveStation } from './generator_revolve_profile.js';

/**
 * Turns a profile curve into stations: curve x runs along the height and curve
 * y scales the radius, so 1.0 is the full radius. Bent segments are split by
 * their detail. With markers the base and top sections keep fixed heights and
 * the middle stretches. Stations of square segments are marked square.
 *
 * @param curve Profile curve.
 * @param height Height the profile is stretched to.
 * @param radius Radius at curve value 1.
 * @param fixed Heights of the sections below and above the markers.
 * @returns Stations from bottom to top.
 */
export function generatorRevolveStationsFromCurve(
  curve: Curve,
  height: number,
  radius: number,
  fixed: CurveMarkerHeights = { base: 0, top: 0 },
): GeneratorRevolveStation[] {
  const along = curveMarkersHeightMap(curve.markers, height, fixed);
  const points = generatorRevolveSplitAt(generatorRevolveSamples(curve), [curve.markers?.bottom, curve.markers?.top]);
  return points.map((point) => ({
    height: along(point.x),
    radius: point.y * radius,
    ...(point.square ? { square: true } : {}),
  }));
}

/** A profile sample; square marks the piece from it to the next sample. */
interface GeneratorRevolveSample extends CurveVector {
  /** True when the piece above is square. */
  square?: boolean;
}

/**
 * Samples the curve like {@link curveSample}, marking each sample whose piece
 * belongs to a square segment.
 *
 * @param curve Curve.
 * @returns Samples left to right.
 */
function generatorRevolveSamples(curve: Curve): GeneratorRevolveSample[] {
  const first = curve.points[0];
  if (!first) return [];
  const samples: GeneratorRevolveSample[] = [{ x: first.x, y: first.y }];
  curve.segments.forEach((segment, index) => {
    const square = segment.section === 'square';
    const start = samples[samples.length - 1];
    if (start && square) start.square = true;
    const pieces = curveSegmentSample(curve, index);
    pieces.forEach((point, at) => samples.push(at < pieces.length - 1 && square ? { ...point, square } : { ...point }));
  });
  return samples;
}

/**
 * Adds a sample at each marker so the profile bends exactly where its fixed and
 * stretching sections meet. The added sample keeps the cross-section of the
 * piece it splits.
 *
 * @param points Samples from left to right.
 * @param cuts Marker positions; undefined entries are skipped.
 * @returns Samples with the cuts added.
 */
function generatorRevolveSplitAt(
  points: GeneratorRevolveSample[],
  cuts: readonly (number | undefined)[],
): GeneratorRevolveSample[] {
  const result = [...points];
  for (const cut of cuts) {
    if (cut === undefined) continue;
    const after = result.findIndex((point) => point.x >= cut);
    const right = result[after];
    const left = result[after - 1];
    if (!right || !left || Math.abs(right.x - cut) < 1e-9) continue;
    const t = (cut - left.x) / Math.max(1e-12, right.x - left.x);
    const square = left.square ? { square: true } : {};
    result.splice(after, 0, { x: cut, y: left.y + (right.y - left.y) * t, ...square });
  }
  return result;
}
