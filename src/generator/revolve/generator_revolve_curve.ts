import type { Curve } from '@/curve/model/curve_model.js';
import { curveMarkerHeights, curveMarkersHeightMap, type CurveMarkerHeights } from '@/curve/model/curve_markers.js';
import { generatorRevolveSamples, type GeneratorRevolveSample } from './generator_revolve_sample.js';
import type { GeneratorRevolveStation } from './generator_revolve_profile.js';
import { generatorRevolveSideSamples } from './generator_revolve_side.js';

/**
 * Turns a profile curve into stations: curve x runs along the height and curve
 * y scales the radius, so 1.0 is the full radius. Bent segments are split by
 * their detail. With markers the base and top sections keep fixed heights and
 * the middle stretches. Stations of square segments are marked square, and
 * sided pieces get their own +X and -X extents and depth.
 *
 * @param curve Profile curve.
 * @param height Height the profile is stretched to.
 * @param radius Radius at curve value 1.
 * @param fixed Heights of the sections below and above the markers for curves
 *   that do not carry their own.
 * @returns Stations from bottom to top.
 */
export function generatorRevolveStationsFromCurve(
  curve: Curve,
  height: number,
  radius: number,
  fixed: CurveMarkerHeights = { base: 0, top: 0 },
): GeneratorRevolveStation[] {
  const along = curveMarkersHeightMap(curve.markers, height, curveMarkerHeights(curve, fixed));
  const split = generatorRevolveSplitAt(generatorRevolveSamples(curve), [curve.markers?.bottom, curve.markers?.top]);
  return generatorRevolveSideSamples(curve, split).map((point) => ({
    height: along(point.x),
    radius: point.y * radius,
    ...generatorRevolveSampleSection(point),
    ...(point.offset !== undefined ? { offset: point.offset * radius } : {}),
    ...(point.depthRadius !== undefined ? { depthRadius: point.depthRadius * radius } : {}),
  }));
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
    const section = generatorRevolveSampleSection(left);
    result.splice(after, 0, {
      x: cut,
      y: left.y + (right.y - left.y) * t,
      ...section,
      angle: (left.angle ?? 0) + ((right.angle ?? 0) - (left.angle ?? 0)) * t,
    });
  }
  return result;
}

/**
 * Copies the piece's section without adding default properties.
 *
 * @param sample Profile sample.
 * @returns Optional cross-section fields.
 */
function generatorRevolveSampleSection(sample: GeneratorRevolveSample): Partial<GeneratorRevolveStation> {
  const { x, y, ...section } = sample;
  return section;
}
