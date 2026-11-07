import { Euler, Matrix4, Quaternion, Vector3 } from 'three';

/**
 * Reads a vector stored as three prefixed parameters.
 *
 * @param parameters Normalized parameters.
 * @param prefix Key stem.
 * @returns Vector of the X, Y, Z values.
 */
export function modifierStackVector(parameters: Record<string, unknown>, prefix: string): Vector3 {
  return new Vector3(...(['X', 'Y', 'Z'] as const).map((axis) => Number(parameters[prefix + axis] ?? 0)));
}

/**
 * Resolves an axis name.
 *
 * @param axis 'x', 'y' or 'z'.
 * @returns Unit axis; Y for anything else.
 */
export function modifierStackAxis(axis: unknown): Vector3 {
  if (axis === 'x') return new Vector3(1, 0, 0);
  if (axis === 'z') return new Vector3(0, 0, 1);
  return new Vector3(0, 1, 0);
}

/**
 * Applies a linear operator around a pivot.
 *
 * @param matrix Rotation or reflection.
 * @param pivot Pivot point.
 * @returns Operator that keeps the pivot fixed.
 */
export function modifierStackAroundPivot(matrix: Matrix4, pivot: Vector3): Matrix4 {
  return new Matrix4()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(matrix)
    .multiply(new Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
}

/**
 * Builds one rigid step from a translation and degree rotations about a pivot.
 *
 * @param translation Translation.
 * @param degrees X, Y, Z rotation in degrees.
 * @param pivot Rotation pivot.
 * @returns Rigid operator.
 */
export function modifierStackRigidStep(translation: Vector3, degrees: Vector3, pivot: Vector3): Matrix4 {
  const radians = degrees.clone().multiplyScalar(Math.PI / 180);
  const rotation = new Matrix4().makeRotationFromQuaternion(
    new Quaternion().setFromEuler(new Euler(radians.x, radians.y, radians.z)),
  );
  const result = modifierStackAroundPivot(rotation, pivot);
  result.setPosition(new Vector3().setFromMatrixPosition(result).add(translation));
  return result;
}
