import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { GeneratorField, GeneratorSettings } from './modifier_generator_types.js';

/**
 * Reads a normalized vector setting. @param settings Strategy state. @param
 * prefix Vector property stem.
 */
export function generatorVector(settings: GeneratorSettings, prefix: string): Vector3 {
  return new Vector3(...(['X', 'Y', 'Z'] as const).map((axis) => Number(settings.parameters[prefix + axis] ?? 0)));
}
/**
 * Creates three reusable inspector properties. @param prefix Property stem.
 *
 * @param label Visible caption. @param defaults Default XYZ values. @param
 *   visible Context predicate.
 */
export function generatorVectorFields(
  prefix: string,
  label: string,
  defaults: readonly number[] = [0, 0, 0],
  visible?: (settings: GeneratorSettings) => boolean,
): GeneratorField[] {
  return ['X', 'Y', 'Z'].map((axis, index) => ({
    key: prefix + axis,
    label: `${label} ${axis}`,
    type: 'number',
    default: defaults[index] ?? 0,
    ...(visible ? { visible } : {}),
  }));
}
/** Resolves an axis selector. @param axis Axis name. */
export function generatorAxis(axis: unknown): Vector3 {
  return axis === 'x' ? new Vector3(1, 0, 0) : axis === 'z' ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
}
/**
 * Moves a linear operator around a pivot. @param matrix Rotation/reflection.
 *
 * @param pivot Frame-relative pivot.
 */
export function generatorAroundPivot(matrix: Matrix4, pivot: Vector3): Matrix4 {
  return new Matrix4()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(matrix)
    .multiply(new Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
}
/**
 * Builds a rigid transform from degree rotations. @param translation
 * Translation in placement basis. @param degrees XYZ degrees. @param pivot
 * Rotation pivot.
 */
export function generatorRigidStep(translation: Vector3, degrees: Vector3, pivot: Vector3): Matrix4 {
  const radians = degrees.clone().multiplyScalar(Math.PI / 180);
  const rotation = new Matrix4().makeRotationFromQuaternion(
    new Quaternion().setFromEuler(new Euler(radians.x, radians.y, radians.z)),
  );
  const result = generatorAroundPivot(rotation, pivot);
  result.setPosition(new Vector3().setFromMatrixPosition(result).add(translation));
  return result;
}
