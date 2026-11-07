import type { Curve } from '@/curve/model/curve_model.js';
import { curveSample } from '@/curve/model/curve_sample.js';
import type { GeneratorRevolveStation } from './generator_revolve_profile.js';

/**
 * Turns a profile curve into stations: curve x runs along the height and curve
 * y scales the radius, so 1.0 is the full radius. Bent segments are split by
 * their detail.
 *
 * @param curve Profile curve.
 * @param height Height the profile is stretched to.
 * @param radius Radius at curve value 1.
 * @returns Stations from bottom to top.
 */
export function generatorRevolveStationsFromCurve(
  curve: Curve,
  height: number,
  radius: number,
): GeneratorRevolveStation[] {
  return curveSample(curve).map((point) => ({ height: point.x * height, radius: point.y * radius }));
}
