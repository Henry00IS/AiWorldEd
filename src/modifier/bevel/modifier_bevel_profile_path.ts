import { MathUtils, Vector3 } from 'three';
import type { ModifierBevelGirder } from './modifier_bevel_uv_girder.js';

/**
 * Measures a sampled path in world units.
 *
 * @param samples World profile vertices.
 */
export function modifierBevelPathLength(samples: readonly Vector3[]): number {
  return samples.reduce((length, point, index) => length + (samples[index - 1]?.distanceTo(point) ?? 0), 0);
}

/**
 * Finds closest profile travel, ignoring the extrusion axis.
 *
 * @param samples World profile path.
 * @param point World sample.
 * @param axis Unit extrusion axis.
 */
export function modifierBevelPathTravel(
  samples: readonly Vector3[],
  point: Vector3,
  axis: Vector3,
): { distance: number; travel: number } {
  let best = { distance: Infinity, travel: 0 };
  let travel = 0;
  for (let index = 1; index < samples.length; index++) {
    const start = samples[index - 1];
    const end = samples[index];
    if (!start || !end) continue;
    const chord = end.clone().sub(start);
    const relative = point.clone().sub(start).addScaledVector(axis, -point.clone().sub(start).dot(axis));
    const factor = MathUtils.clamp(relative.dot(chord) / Math.max(chord.lengthSq(), 1e-20), 0, 1);
    const distance = relative.distanceTo(chord.clone().multiplyScalar(factor));
    if (distance < best.distance) best = { distance, travel: travel + factor * chord.length() };
    travel += chord.length();
  }
  return best;
}

/**
 * Tests membership of a shaped extrusion rather than assuming a circle.
 *
 * @param girder Shaped chart.
 * @param points Local face points.
 */
export function modifierBevelPathFits(girder: ModifierBevelGirder, points: readonly Vector3[]): boolean {
  const path = girder.profileSamples?.map((point) => point.clone().applyMatrix4(girder.localToWorld));
  if (!path) return false;
  const axis = girder.direction.clone().transformDirection(girder.localToWorld);
  return points.every(
    (point) => modifierBevelPathTravel(path, point.clone().applyMatrix4(girder.localToWorld), axis).distance < 1e-5,
  );
}
