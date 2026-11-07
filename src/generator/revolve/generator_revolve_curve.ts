import type { Curve, CurveVector } from '@/curve/model/curve_model.js';
import { curveMarkersHeightMap, type CurveMarkerHeights } from '@/curve/model/curve_markers.js';
import { curveSample } from '@/curve/model/curve_sample.js';
import type { GeneratorRevolveStation } from './generator_revolve_profile.js';

/**
 * Turns a profile curve into stations: curve x runs along the height and curve
 * y scales the radius, so 1.0 is the full radius. Bent segments are split by
 * their detail. With markers the base and top sections keep fixed heights and
 * the middle stretches.
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
  const points = generatorRevolveSplitAt(curveSample(curve), [curve.markers?.bottom, curve.markers?.top]);
  return points.map((point) => ({ height: along(point.x), radius: point.y * radius }));
}

/**
 * Adds a sample at each marker so the profile bends exactly where its fixed and
 * stretching sections meet.
 *
 * @param points Samples from left to right.
 * @param cuts Marker positions; undefined entries are skipped.
 * @returns Samples with the cuts added.
 */
function generatorRevolveSplitAt(points: CurveVector[], cuts: readonly (number | undefined)[]): CurveVector[] {
  const result = [...points];
  for (const cut of cuts) {
    if (cut === undefined) continue;
    const after = result.findIndex((point) => point.x >= cut);
    const right = result[after];
    const left = result[after - 1];
    if (!right || !left || Math.abs(right.x - cut) < 1e-9) continue;
    const t = (cut - left.x) / Math.max(1e-12, right.x - left.x);
    result.splice(after, 0, { x: cut, y: left.y + (right.y - left.y) * t });
  }
  return result;
}
