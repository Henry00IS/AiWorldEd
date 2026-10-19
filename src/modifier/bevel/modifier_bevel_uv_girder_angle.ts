import { Matrix4, Vector3 } from 'three';
import type { ModifierBevelGirder } from './modifier_bevel_uv_girder.js';

/**
 * Returns the signed turn from one direction to another around an axis.
 *
 * @param from Starting direction.
 * @param to Ending direction.
 * @param axis Unit axis. Positive turns follow the right hand.
 * @returns Radians.
 */
export function modifierBevelSignedTurn(from: Vector3, to: Vector3, axis: Vector3): number {
  const planeFrom = modifierBevelPlaneVector(from, axis);
  const planeTo = modifierBevelPlaneVector(to, axis);
  if (planeFrom.lengthSq() < 1e-12 || planeTo.lengthSq() < 1e-12) return 0;
  return modifierBevelAtanTurn(planeFrom.normalize(), planeTo.normalize(), axis);
}

/**
 * Returns the profile fraction of a local point around a girder.
 *
 * @param girder Authored edge.
 * @param matrix Brush local-to-world matrix.
 * @param point Local point.
 * @returns Fraction, 0 at the first wall and 1 at the second.
 */
export function modifierBevelGirderFraction(girder: ModifierBevelGirder, matrix: Matrix4, point: Vector3): number {
  const radial = modifierBevelWorldRadial(girder, matrix, point);
  if (radial.lengthSq() < 1e-12) return 0;
  return modifierBevelFractionFromRadial(girder, matrix, radial);
}

/**
 * Removes the component parallel to an axis.
 *
 * @param vector Direction.
 * @param axis Unit axis.
 * @returns In-plane vector.
 */
function modifierBevelPlaneVector(vector: Vector3, axis: Vector3): Vector3 {
  return vector.clone().addScaledVector(axis, -vector.dot(axis));
}

/**
 * Returns the signed angle between two unit in-plane directions.
 *
 * @param from Unit starting direction.
 * @param to Unit ending direction.
 * @param axis Unit axis.
 * @returns Radians.
 */
function modifierBevelAtanTurn(from: Vector3, to: Vector3, axis: Vector3): number {
  const sin = axis.dot(new Vector3().crossVectors(from, to));
  return Math.atan2(sin, from.dot(to));
}

/**
 * Returns the world vector from the edge axis to a point.
 *
 * @param girder Authored edge.
 * @param matrix Brush local-to-world matrix.
 * @param point Local point.
 * @returns Radial vector.
 */
function modifierBevelWorldRadial(girder: ModifierBevelGirder, matrix: Matrix4, point: Vector3): Vector3 {
  const radial = point.clone().applyMatrix4(matrix).sub(girder.origin.clone().applyMatrix4(matrix));
  const axis = girder.direction.clone().transformDirection(matrix);
  return radial.addScaledVector(axis, -radial.dot(axis));
}

/**
 * Divides the radial's turn by the full profile turn.
 *
 * @param girder Authored edge.
 * @param matrix Brush local-to-world matrix.
 * @param radial World radial.
 * @returns Fraction.
 */
function modifierBevelFractionFromRadial(girder: ModifierBevelGirder, matrix: Matrix4, radial: Vector3): number {
  const axis = girder.direction.clone().transformDirection(matrix);
  const from = girder.contactA.clone().transformDirection(matrix);
  const opening = modifierBevelSignedTurn(from, girder.contactB.clone().transformDirection(matrix), axis);
  if (Math.abs(opening) < 1e-6) return 0;
  return modifierBevelSignedTurn(from, radial, axis) / opening;
}
