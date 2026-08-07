import * as THREE from 'three';
import type { AxisDirection, CoordinateSpaceDefinition } from '@/settings/coordinate/coordinate_space_types.js';
import type { GameProfile } from '@/settings/store/settings_types.js';
import type { ImperialUnit, MetricUnit } from '@/settings/units/unit_presets.js';

/** Editor internal coordinate space: right +X, up +Y, forward -Z, right-handed. */
export const EDITOR_COORDINATE_SPACE: Readonly<CoordinateSpaceDefinition> = Object.freeze({
  presetId: 'editor',
  name: 'Editor (Three.js)',
  handedness: 'right',
  up: '+y',
  right: '+x',
  forward: '-z',
  isCustom: false,
});

/**
 * Returns the length in meters of one unit of the supplied metric unit.
 *
 * @param unit Metric unit identifier.
 * @returns Meters per one unit of `unit`.
 */
export function metersPerMetricUnit(unit: MetricUnit): number {
  switch (unit) {
    case 'millimeter':
      return 0.001;
    case 'centimeter':
      return 0.01;
    case 'meter':
      return 1;
    case 'kilometer':
      return 1000;
  }
}

/**
 * Returns the length in meters of one unit of the supplied imperial unit.
 *
 * @param unit Imperial unit identifier.
 * @returns Meters per one unit of `unit`.
 */
export function metersPerImperialUnit(unit: ImperialUnit): number {
  switch (unit) {
    case 'inch':
      return 0.0254;
    case 'foot':
      return 0.3048;
    case 'yard':
      return 0.9144;
    case 'mile':
      return 1609.344;
  }
}

/**
 * Returns how many of the profile's selected length units equal one meter.
 * Returns 1 when the profile unit length in meters is zero.
 *
 * @param profile Active game profile.
 * @returns Units-per-meter scale (e.g. 100 for centimeter, ~3.28 for foot).
 */
export function unitsPerMeter(profile: GameProfile): number {
  const metersPerUnit = resolveMetersPerUnit(profile);
  return metersPerUnit === 0 ? 1 : 1 / metersPerUnit;
}

/**
 * Resolves the meters-per-unit factor for the profile's selected unit.
 *
 * @param profile Active game profile.
 * @returns Length of one profile unit in meters.
 */
function resolveMetersPerUnit(profile: GameProfile): number {
  if (profile.unitSystem === 'metric') {
    return metersPerMetricUnit(profile.metricUnit);
  }
  return metersPerImperialUnit(profile.imperialUnit);
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
 * Builds the 3x3 matrix that re-maps coordinates from editor space (right +X,
 * up +Y, forward -Z) into the target space. Columns are the target right, up,
 * and negated-forward axes as unit vectors; only those three axis fields are
 * read from `target`.
 *
 * @param target Target coordinate space definition.
 * @returns 3x3 rotation matrix (may include axis-derived reflection).
 */
export function buildCoordinateRotation(target: CoordinateSpaceDefinition): THREE.Matrix3 {
  const right = axisToVector(target.right);
  const up = axisToVector(target.up);
  const negativeForward = axisToVector(target.forward).negate();
  const rotation = new THREE.Matrix3(
    right.x,
    up.x,
    negativeForward.x,
    right.y,
    up.y,
    negativeForward.y,
    right.z,
    up.z,
    negativeForward.z,
  );
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
 * Builds a 4x4 transform combining the profile unit scale and coordinate-space
 * rotation, with no translation. Returns the identity matrix when `profile` is
 * null.
 *
 * @param profile Active game profile, or null when no profile is active.
 * @returns 4x4 transform matrix (scale times rotation, no translation).
 */
export function buildExportRootTransform(profile: GameProfile | null): THREE.Matrix4 {
  if (!profile) {
    return new THREE.Matrix4();
  }
  const rotation = buildCoordinateRotation(profile.coordinateSpace);
  const scale = unitsPerMeter(profile);
  const matrix4 = new THREE.Matrix4();
  composeFromRotationScale(matrix4, rotation, scale);
  normalizeNegativeZeros(matrix4);
  return matrix4;
}

/**
 * Returns the FBX GlobalSettings UnitScaleFactor for `profile`: centimeters per
 * one file unit. Yields 100 when `profile` is null; otherwise meters per one
 * profile unit times 100.
 *
 * @param profile Active game profile, or null for editor meters as file units.
 * @returns UnitScaleFactor value for FBX GlobalSettings.
 */
export function resolveFbxUnitScaleFactor(profile: GameProfile | null): number {
  if (!profile) {
    return 100;
  }
  const metersPerFileUnit = resolveMetersPerUnit(profile);
  return metersPerFileUnit * 100;
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
