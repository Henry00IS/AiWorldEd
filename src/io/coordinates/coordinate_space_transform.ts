import * as THREE from 'three';
import type { AxisDirection, CoordinateSpaceDefinition } from '@/settings/coordinate/coordinate_space_types.js';
import type { ExportSpace, MetricUnit } from '@/io/coordinates/export_space.js';

/**
 * Returns the length in meters of one unit of the supplied metric unit.
 *
 * @param unit Metric unit identifier.
 * @returns Meters per one unit of `unit`.
 */
export function metersPerMetricUnit(unit: MetricUnit): number {
  switch (unit) {
    case 'centimeter':
      return 0.01;
    case 'meter':
      return 1;
  }
}

/**
 * Returns how many file units equal one meter.
 *
 * @param space Export space.
 * @returns Units-per-meter scale (e.g. 100 for centimeter).
 */
export function unitsPerMeter(space: ExportSpace): number {
  return 1 / metersPerMetricUnit(space.metricUnit);
}

/**
 * Converts an axis direction token to a signed unit vector.
 *
 * @param axis Axis direction token.
 * @returns Unit vector for that axis direction.
 */
export function axisToVector(axis: AxisDirection): THREE.Vector3 {
  switch (axis) {
    case '+x':
      return new THREE.Vector3(1, 0, 0);
    case '-x':
      return new THREE.Vector3(-1, 0, 0);
    case '+y':
      return new THREE.Vector3(0, 1, 0);
    case '-y':
      return new THREE.Vector3(0, -1, 0);
    case '+z':
      return new THREE.Vector3(0, 0, 1);
    case '-z':
      return new THREE.Vector3(0, 0, -1);
  }
}

/**
 * Builds the 3x3 matrix that re-maps coordinates from editor space into the
 * target space, so a model keeps its sides: the editor's up (+Y), front (+Z)
 * and model right (-X) land on the target's up, forward and right. Only those
 * three axis fields are read from `target`.
 *
 * @param target Target coordinate space definition.
 * @returns 3x3 rotation matrix (may include axis-derived reflection).
 */
export function buildCoordinateRotation(target: CoordinateSpaceDefinition): THREE.Matrix3 {
  const left = axisToVector(target.right).negate();
  const up = axisToVector(target.up);
  const forward = axisToVector(target.forward);
  const rotation = new THREE.Matrix3(left.x, up.x, forward.x, left.y, up.y, forward.y, left.z, up.z, forward.z);
  return rotation;
}

/**
 * Returns true when the supplied 4x4 transform has a negative determinant. A
 * negative determinant indicates a reflection (handedness flip).
 *
 * @param matrix Transform matrix to inspect.
 * @returns True when the matrix is reflective.
 */
export function isReflectionMatrix(matrix: THREE.Matrix4): boolean {
  return matrix.determinant() < 0;
}

/**
 * Builds a 4x4 transform combining the unit scale and coordinate-space rotation
 * of `space`, with no translation. Returns the identity matrix when `space` is
 * null.
 *
 * @param space Export space, or null to keep editor space.
 * @returns 4x4 transform matrix (scale times rotation, no translation).
 */
export function buildExportRootTransform(space: ExportSpace | null): THREE.Matrix4 {
  if (!space) {
    return new THREE.Matrix4();
  }
  const rotation = buildCoordinateRotation(space.coordinateSpace);
  const scale = unitsPerMeter(space);
  const matrix4 = new THREE.Matrix4();
  composeFromRotationScale(matrix4, rotation, scale);
  normalizeNegativeZeros(matrix4);
  return matrix4;
}

/**
 * Builds the transform from editor space into the axes a model file (FBX, OBJ)
 * is written in. Those files are right-handed, and engines with a left-handed
 * space (Unity, Unreal) mirror the right axis when importing them, so for such
 * a target the file holds the target space with its right axis negated: a pure
 * rotation (and unit scale) of the editor scene that the import's mirror turns
 * into the target space. Right-handed targets keep their mapping. Returns the
 * identity matrix when `space` is null.
 *
 * @param space Export space, or null.
 * @returns 4x4 transform with a positive determinant.
 */
export function buildModelFileTransform(space: ExportSpace | null): THREE.Matrix4 {
  const matrix = buildExportRootTransform(space);
  if (!space || !isReflectionMatrix(matrix)) return matrix;
  const right = axisToVector(space.coordinateSpace.right);
  const mirror = new THREE.Matrix4().makeScale(right.x === 0 ? 1 : -1, right.y === 0 ? 1 : -1, right.z === 0 ? 1 : -1);
  matrix.premultiply(mirror);
  normalizeNegativeZeros(matrix);
  return matrix;
}

/**
 * Returns the FBX GlobalSettings UnitScaleFactor for `space`: centimeters per
 * one file unit. Yields 100 when `space` is null (editor meters as file
 * units).
 *
 * @param space Export space, or null.
 * @returns UnitScaleFactor value for FBX GlobalSettings.
 */
export function resolveFbxUnitScaleFactor(space: ExportSpace | null): number {
  return space ? metersPerMetricUnit(space.metricUnit) * 100 : 100;
}

/**
 * Replaces each negative-zero element of the matrix with positive zero in
 * place.
 *
 * @param matrix Matrix whose elements to normalize in place.
 */
function normalizeNegativeZeros(matrix: THREE.Matrix4): void {
  const elements = matrix.elements;
  for (let i = 0; i < elements.length; i++) {
    if (elements[i] === 0) {
      elements[i] = 0;
    }
  }
}

/**
 * Writes a 4x4 matrix from a 3x3 rotation and a uniform scale, preserving any
 * reflection present in the rotation.
 *
 * @param destination Matrix to overwrite.
 * @param rotation 3x3 rotation (may be reflective).
 * @param scale Uniform scale factor.
 */
function composeFromRotationScale(destination: THREE.Matrix4, rotation: THREE.Matrix3, scale: number): void {
  const r = rotation.elements;
  destination.set(
    r[0] * scale,
    r[3] * scale,
    r[6] * scale,
    0,
    r[1] * scale,
    r[4] * scale,
    r[7] * scale,
    0,
    r[2] * scale,
    r[5] * scale,
    r[8] * scale,
    0,
    0,
    0,
    0,
    1,
  );
}
