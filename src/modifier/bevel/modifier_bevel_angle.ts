import type { Vector3 } from 'three';
import { MathUtils } from 'three';

/** Keeps an edge that sits exactly on the limit from counting as sharp. */
const ANGLE_LIMIT_RADIAN_BIAS = 1.75e-7;

/**
 * Returns whether two outward face normals meet more sharply than a limit.
 *
 * @param normalA First unit outward normal.
 * @param normalB Second unit outward normal.
 * @param angleDegrees Limit in degrees. Larger values keep more edges square.
 * @returns True when the edge should be beveled.
 */
export function modifierBevelNormalsExceedAngle(normalA: Vector3, normalB: Vector3, angleDegrees: number): boolean {
  const limit = MathUtils.degToRad(angleDegrees) + ANGLE_LIMIT_RADIAN_BIAS;
  return normalA.dot(normalB) < Math.cos(limit);
}
