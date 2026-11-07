import { MathUtils, Matrix4, Vector3 } from 'three';
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
 * Returns the linearly interpolated profile fraction on a sampled chord.
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
 * Returns the world vector from the profile center axis to a point.
 *
 * @param girder Authored edge.
 * @param matrix Brush local-to-world matrix.
 * @param point Local point.
 * @returns Radial vector.
 */
function modifierBevelWorldRadial(girder: ModifierBevelGirder, matrix: Matrix4, point: Vector3): Vector3 {
  const radial = point.clone().applyMatrix4(matrix).sub(girder.profileOrigin.clone().applyMatrix4(matrix));
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
  const from = girder.profileContactA.clone().transformDirection(matrix);
  const opening = modifierBevelSignedTurn(from, girder.profileContactB.clone().transformDirection(matrix), axis);
  if (Math.abs(opening) < 1e-6) return 0;
  const fraction = modifierBevelSignedTurn(from, radial, axis) / opening;
  return modifierBevelChordFraction(girder, radial, axis, from, opening, fraction);
}

/**
 * Interpolates profile travel linearly on the sampled chord containing a point.
 *
 * @param girder Authored edge chart.
 * @param radial World vector from the profile center.
 * @param axis World edge direction.
 * @param from World radial direction at the first contact.
 * @param opening Signed full profile turn.
 * @param fraction Angular fraction used to locate the chord.
 * @returns Linearly interpolated profile fraction.
 */
function modifierBevelChordFraction(
  girder: ModifierBevelGirder,
  radial: Vector3,
  axis: Vector3,
  from: Vector3,
  opening: number,
  fraction: number,
): number {
  const count = girder.profileSegments;
  const segment = MathUtils.clamp(Math.floor(fraction * count), 0, count - 1);
  const start = modifierBevelChordRadial(from, axis, (opening * segment) / count, girder.profileRadius);
  const end = modifierBevelChordRadial(from, axis, (opening * (segment + 1)) / count, girder.profileRadius);
  const chord = end.sub(start);
  if (chord.lengthSq() < 1e-16) return fraction;
  return (segment + radial.clone().sub(start).dot(chord) / chord.lengthSq()) / count;
}

/**
 * Returns a sampled radial vector on the profile circle.
 *
 * @param from Unit starting radial.
 * @param axis Unit circle axis.
 * @param turn Signed angle in radians.
 * @param radius Profile radius in world units.
 * @returns World radial vector.
 */
function modifierBevelChordRadial(from: Vector3, axis: Vector3, turn: number, radius: number): Vector3 {
  return from.clone().applyAxisAngle(axis, turn).multiplyScalar(radius);
}
